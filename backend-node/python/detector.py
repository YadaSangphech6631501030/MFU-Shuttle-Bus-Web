import argparse
import json
import os
import sys
import time
import threading
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import cv2
import numpy as np
from pymongo import MongoClient
from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser(description="Run YOLO person detection for one station camera.")
    parser.add_argument("--station-id", required=True)
    parser.add_argument("--camera-url", required=True)
    parser.add_argument("--mongo-uri", default=os.environ.get("MONGO_URI", "mongodb://localhost:27017/"))
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "shuttlebus_web_system"))
    parser.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "yolov8s.pt"))
    parser.add_argument("--frame-dir", default=os.path.join(os.path.dirname(__file__), "..", "runtime", "frames"))
    parser.add_argument("--save-interval", type=float, default=5.0)
    parser.add_argument("--frame-interval", type=float, default=0.5)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--confidence", type=float, default=0.3)
    parser.add_argument("--roi", default="[]")
    return parser.parse_args()


def get_status(count):
    if count <= 5:
        return "LOW", (0, 220, 0)
    if count <= 9:
        return "MEDIUM", (0, 210, 255)
    return "HIGH", (0, 0, 255)


def connect_camera(camera_url):
    print("[detector] Connecting camera", flush=True)
    cap = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG, [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
        cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000,
    ])
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        cap.release()
        print("[detector] Cannot connect camera", flush=True)
        return None

    print("[detector] Camera connected", flush=True)
    return cap


class LatestCamera:
    """Continuously drain the camera; inference consumes only the newest frame."""

    def __init__(self, camera_url):
        self.camera_url = camera_url
        self.condition = threading.Condition()
        self.latest = None
        self.sequence = 0
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()

    def _read(self):
        while not self.stopped.is_set():
            cap = None
            try:
                cap = connect_camera(self.camera_url)
                if cap is None:
                    self.stopped.wait(2)
                    continue
                while not self.stopped.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        print("[detector] Camera read failed, reconnecting", flush=True)
                        break
                    with self.condition:
                        self.latest = frame
                        self.sequence += 1
                        self.condition.notify_all()
            except cv2.error:
                print("[detector] Camera decoder error, reconnecting", flush=True)
            finally:
                if cap is not None:
                    cap.release()
                with self.condition:
                    self.latest = None
            self.stopped.wait(2)

    def read(self, after):
        with self.condition:
            self.condition.wait_for(
                lambda: self.latest is not None and self.sequence != after,
                timeout=1,
            )
            return self.sequence, self.latest

    def close(self):
        self.stopped.set()
        self.thread.join(timeout=6)


def save_frame(frame_dir, station_id, frame):
    os.makedirs(frame_dir, exist_ok=True)
    frame_path = os.path.join(frame_dir, f"{station_id}.jpg")
    temp_path = os.path.join(frame_dir, f"{station_id}.tmp.jpg")

    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        return

    with open(temp_path, "wb") as file:
        file.write(encoded.tobytes())

    try:
        os.replace(temp_path, frame_path)
    except PermissionError:
        # Windows can refuse replacement while an HTTP reader holds the JPEG.
        # Drop this preview update; the next frame will overwrite the temp file.
        # Do not terminate detection or retry in a loop that delays live frames.
        return False
    return True


def parse_roi(raw_roi):
    try:
        roi = json.loads(raw_roi or "[]")
    except json.JSONDecodeError:
        return []

    if not isinstance(roi, list) or len(roi) < 3:
        return []

    points = []
    for point in roi:
        if not isinstance(point, list) or len(point) != 2:
            return []
        try:
            x, y = float(point[0]), float(point[1])
        except (TypeError, ValueError):
            return []
        if not math.isfinite(x) or not math.isfinite(y) or x < 0 or x > 1 or y < 0 or y > 1:
            return []
        points.append((x, y))

    return points


def roi_to_pixels(roi, width, height):
    if not roi:
        return None
    return np.array(
        [[int(x * width), int(y * height)] for x, y in roi],
        dtype=np.int32,
    )


def detection_crop(frame, roi):
    """Spend inference pixels on the waiting area without masking people's bodies."""
    height, width = frame.shape[:2]
    if not roi:
        return frame, (0, 0)
    xs, ys = zip(*roi)
    # Context around the polygon preserves people standing near its edges.
    pad_x = max(32, int((max(xs) - min(xs)) * width * 0.15))
    pad_y = max(32, int((max(ys) - min(ys)) * height * 0.15))
    left = max(0, int(min(xs) * width) - pad_x)
    top = max(0, int(min(ys) * height) - pad_y)
    right = min(width, math.ceil(max(xs) * width) + pad_x)
    bottom = min(height, math.ceil(max(ys) * height) + pad_y)
    return frame[top:bottom, left:right], (left, top)


def restore_box(box, offset):
    x1, y1, x2, y2 = map(float, box)
    dx, dy = offset
    return x1 + dx, y1 + dy, x2 + dx, y2 + dy


class StableCount:
    """Require repeated observations before changing occupancy; never sum old IDs."""

    def __init__(self):
        self.value = None
        self.pending = None
        self.since = 0.0
        self.last_seen = None

    def update(self, count, now):
        # Do not carry a pre-disconnect count into a fresh feed.
        if self.value is None or (self.last_seen is not None and now - self.last_seen > 3):
            self.value = count
            self.pending = None
        self.last_seen = now
        if count == self.value:
            self.pending = None
        elif count != self.pending:
            self.pending = count
            self.since = now
        elif now - self.since >= (0.5 if count > self.value else 1.0):
            self.value = count
            self.pending = None
        return self.value


def is_center_inside_roi(box, roi_pixels):
    if roi_pixels is None:
        return True

    x1, y1, x2, y2 = map(float, box)
    center = ((x1 + x2) / 2, (y1 + y2) / 2)
    return cv2.pointPolygonTest(roi_pixels, center, False) >= 0


def main():
    args = parse_args()
    print(f"[detector] Starting station={args.station_id}", flush=True)

    client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=3000,
                         connectTimeoutMS=3000, socketTimeoutMS=3000)
    collection = client[args.db_name]["stations"]
    model = YOLO(args.model)
    roi = parse_roi(args.roi)

    cap = LatestCamera(args.camera_url)
    db_writer = ThreadPoolExecutor(max_workers=1)
    db_save = None
    sequence = 0
    stable_count = StableCount()
    last_inference = None

    last_db_save = 0.0
    last_frame_save = 0.0

    try:
        while True:
            next_sequence, frame = cap.read(sequence)
            if frame is None or next_sequence == sequence:
                continue
            sequence = next_sequence

            height, width = frame.shape[:2]
            roi_pixels = roi_to_pixels(roi, width, height)
            detection_frame, offset = detection_crop(frame, roi)
            inference_time = time.monotonic()
            if last_inference is not None and inference_time - last_inference > 3:
                for tracker in getattr(model.predictor, "trackers", []):
                    tracker.reset()
            last_inference = inference_time
            results = model.track(detection_frame, persist=True, classes=[0],
                                  conf=args.confidence, imgsz=args.imgsz, verbose=False)[0]
            visible_boxes = []
            visible_ids = set()

            if results.boxes is not None:
                ids = results.boxes.id
                # Transfer all boxes once instead of synchronizing the GPU per scalar.
                boxes = results.boxes.xyxy.cpu().tolist()
                track_ids = ids.int().cpu().tolist() if ids is not None else None
                for index, crop_box in enumerate(boxes):
                    box = restore_box(crop_box, offset)
                    if not is_center_inside_roi(box, roi_pixels):
                        continue

                    visible_boxes.append(box)
                    if track_ids is not None:
                        visible_ids.add(track_ids[index])

            raw_count = len(visible_ids) if visible_ids else len(visible_boxes)
            current_count = stable_count.update(raw_count, inference_time)

            status, color = get_status(current_count)
            annotated = frame.copy()

            if roi_pixels is not None:
                overlay = annotated.copy()
                cv2.polylines(overlay, [roi_pixels], True, (255, 255, 255), 3)
                cv2.fillPoly(overlay, [roi_pixels], (0, 80, 255))
                annotated = cv2.addWeighted(overlay, 0.22, annotated, 0.78, 0)

            if visible_boxes:
                for box in visible_boxes:
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            cv2.rectangle(annotated, (12, 12), (310, 92), (20, 20, 20), -1)
            cv2.putText(annotated, f"Station: {args.station_id}", (24, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2)
            cv2.putText(annotated, f"Waiting: {current_count}  {status}", (24, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.72, color, 2)

            now = time.monotonic()

            if now - last_frame_save >= args.frame_interval:
                save_frame(args.frame_dir, args.station_id, annotated)
                last_frame_save = now

            if db_save is not None and db_save.done():
                try:
                    db_save.result()
                except Exception as exc:
                    print(f"[detector] Database update failed: {exc}", flush=True)
                db_save = None

            if now - last_db_save >= args.save_interval and db_save is None:
                db_save = db_writer.submit(collection.update_one,
                    {"id": args.station_id},
                    {
                        "$set": {
                            "waiting": current_count,
                            "status": status,
                            "detectorUpdatedAt": datetime.now(),
                        }
                    },
                )
                print(f"[detector] {args.station_id}: waiting={current_count}, raw={raw_count}, status={status}", flush=True)
                last_db_save = now
    finally:
        cap.close()
        db_writer.shutdown(wait=True)
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
    except Exception as exc:
        print(f"[detector] Fatal error: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
