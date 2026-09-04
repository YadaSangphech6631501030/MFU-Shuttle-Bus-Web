import argparse
import json
import os
import sys
import time
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
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "shuttlebus_system"))
    parser.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "yolov8s.pt"))
    parser.add_argument("--frame-dir", default=os.path.join(os.path.dirname(__file__), "..", "runtime", "frames"))
    parser.add_argument("--save-interval", type=float, default=5.0)
    parser.add_argument("--frame-interval", type=float, default=5.0)
    parser.add_argument("--roi", default="[]")
    return parser.parse_args()


def get_status(count):
    if count <= 5:
        return "LOW", (0, 220, 0)
    if count <= 9:
        return "MEDIUM", (0, 210, 255)
    return "HIGH", (0, 0, 255)


def connect_camera(camera_url):
    print(f"[detector] Connecting camera: {camera_url}", flush=True)
    cap = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    time.sleep(1)

    if not cap.isOpened():
        print("[detector] Cannot connect camera", flush=True)
        return None

    print("[detector] Camera connected", flush=True)
    return cap


def save_frame(frame_dir, station_id, frame):
    os.makedirs(frame_dir, exist_ok=True)
    frame_path = os.path.join(frame_dir, f"{station_id}.jpg")
    temp_path = os.path.join(frame_dir, f"{station_id}.tmp.jpg")

    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        return

    with open(temp_path, "wb") as file:
        file.write(encoded.tobytes())

    os.replace(temp_path, frame_path)


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
        x, y = float(point[0]), float(point[1])
        if x < 0 or x > 1 or y < 0 or y > 1:
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


def apply_roi_mask(frame, roi_pixels):
    if roi_pixels is None:
        return frame

    mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [roi_pixels], 255)
    return cv2.bitwise_and(frame, frame, mask=mask)


def is_center_inside_roi(box, roi_pixels):
    if roi_pixels is None:
        return True

    x1, y1, x2, y2 = map(float, box)
    center = ((x1 + x2) / 2, (y1 + y2) / 2)
    return cv2.pointPolygonTest(roi_pixels, center, False) >= 0


def main():
    args = parse_args()
    print(f"[detector] Starting station={args.station_id}", flush=True)

    client = MongoClient(args.mongo_uri)
    collection = client[args.db_name]["stations"]
    model = YOLO(args.model)
    roi = parse_roi(args.roi)

    cap = connect_camera(args.camera_url)
    if cap is None:
        return 2

    last_db_save = 0.0
    last_frame_save = 0.0

    while True:
      ret, frame = cap.read()

      if not ret:
          print("[detector] Camera read failed, reconnecting", flush=True)
          cap.release()
          time.sleep(2)
          cap = connect_camera(args.camera_url)
          if cap is None:
              time.sleep(3)
          continue

      height, width = frame.shape[:2]
      roi_pixels = roi_to_pixels(roi, width, height)
      detection_frame = apply_roi_mask(frame, roi_pixels)
      results = model.track(detection_frame, persist=True, classes=[0], conf=0.3, verbose=False)[0]
      visible_boxes = []
      visible_ids = set()

      if results.boxes is not None:
          ids = results.boxes.id
          for index, box in enumerate(results.boxes.xyxy):
              if not is_center_inside_roi(box, roi_pixels):
                  continue

              visible_boxes.append(box)
              if ids is not None:
                  visible_ids.add(int(ids[index]))

      current_count = len(visible_ids) if visible_ids else len(visible_boxes)

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

      now = time.time()

      if now - last_frame_save >= args.frame_interval:
          save_frame(args.frame_dir, args.station_id, annotated)
          last_frame_save = now

      if now - last_db_save >= args.save_interval:
          collection.update_one(
              {"id": args.station_id},
              {
                  "$set": {
                      "waiting": current_count,
                      "status": status,
                      "detectorUpdatedAt": datetime.now(),
                  }
              },
          )
          print(f"[detector] Saved {args.station_id}: waiting={current_count}, status={status}", flush=True)
          last_db_save = now


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
    except Exception as exc:
        print(f"[detector] Fatal error: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
