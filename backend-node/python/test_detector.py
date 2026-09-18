"""Regression tests without requiring a camera, model, or MongoDB."""
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch


spec = importlib.util.spec_from_file_location(
    "detector_under_test", Path(__file__).with_name("detector.py")
)
detector = importlib.util.module_from_spec(spec)
with patch.dict("sys.modules", {
    name: MagicMock() for name in ("cv2", "numpy", "pymongo", "ultralytics")
}):
    spec.loader.exec_module(detector)


class DetectorRecoveryTests(unittest.TestCase):
    def test_brief_count_errors_do_not_change_occupancy(self):
        counter = detector.StableCount()
        self.assertEqual(counter.update(6, 0), 6)
        self.assertEqual(counter.update(3, 0.2), 6)
        self.assertEqual(counter.update(6, 0.6), 6)
        self.assertEqual(counter.update(9, 0.8), 6)
        self.assertEqual(counter.update(6, 1.0), 6)

    def test_confirmed_arrivals_departures_and_empty_area(self):
        counter = detector.StableCount()
        self.assertEqual(counter.update(6, 0), 6)
        self.assertEqual(counter.update(7, 0.1), 6)
        self.assertEqual(counter.update(7, 0.7), 7)
        self.assertEqual(counter.update(0, 1.0), 7)
        self.assertEqual(counter.update(0, 1.5), 7)
        self.assertEqual(counter.update(0, 2.1), 0)

    def test_count_resets_after_long_gap(self):
        counter = detector.StableCount()
        counter.update(10, 0)
        self.assertEqual(counter.update(1, 5), 1)

    def test_crop_preserves_context_and_restores_coordinates(self):
        frame = MagicMock()
        frame.shape = (1000, 2000, 3)
        crop, offset = detector.detection_crop(frame, [(0.4, 0.4), (0.6, 0.4), (0.6, 0.6)])
        self.assertTrue(0 < offset[0] < 800)
        self.assertTrue(0 < offset[1] < 400)
        y_slice, x_slice = frame.__getitem__.call_args.args[0]
        self.assertGreater(x_slice.stop, 1200)
        self.assertGreater(y_slice.stop, 600)
        self.assertEqual(detector.restore_box([1, 2, 3, 4], offset),
                         (1 + offset[0], 2 + offset[1], 3 + offset[0], 4 + offset[1]))

    def test_no_roi_uses_full_image_and_edge_crop_is_clamped(self):
        frame = MagicMock()
        frame.shape = (1000, 2000, 3)
        crop, offset = detector.detection_crop(frame, [])
        self.assertIs(crop, frame)
        self.assertEqual(offset, (0, 0))
        detector.detection_crop(frame, [(0, 0), (1, 0), (1, 1)])
        y_slice, x_slice = frame.__getitem__.call_args.args[0]
        self.assertEqual((y_slice.start, y_slice.stop), (0, 1000))
        self.assertEqual((x_slice.start, x_slice.stop), (0, 2000))

    def test_invalid_roi_is_rejected(self):
        for raw in ('[[NaN, 0], [1, 0], [1, 1]]',
                    '[["oops", 0], [1, 0], [1, 1]]',
                    '[[null, 0], [1, 0], [1, 1]]'):
            self.assertEqual(detector.parse_roi(raw), [])

    def test_locked_preview_keeps_old_image_and_next_update_recovers(self):
        encoded = MagicMock()
        encoded.tobytes.return_value = b"new-jpeg"
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory, "station09.jpg")
            target.write_bytes(b"previous-jpeg")
            with patch.object(detector.cv2, "imencode", return_value=(True, encoded)):
                with patch.object(detector.os, "replace", side_effect=PermissionError("locked")):
                    self.assertFalse(detector.save_frame(directory, "station09", object()))
                self.assertEqual(target.read_bytes(), b"previous-jpeg")
                self.assertTrue(detector.save_frame(directory, "station09", object()))
            self.assertEqual(target.read_bytes(), b"new-jpeg")
            self.assertFalse(Path(directory, "station09.tmp.jpg").exists())

    def test_unrelated_io_errors_are_not_silently_hidden(self):
        encoded = MagicMock()
        encoded.tobytes.return_value = b"jpeg"
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(detector.cv2, "imencode", return_value=(True, encoded)):
                with patch.object(detector.os, "replace", side_effect=OSError("disk full")):
                    with self.assertRaises(OSError):
                        detector.save_frame(directory, "station09", object())

    def test_decoder_exception_releases_camera_and_reconnects(self):
        class DecoderError(Exception):
            pass

        reader = detector.LatestCamera.__new__(detector.LatestCamera)
        reader.camera_url = "fake"
        reader.condition = threading.Condition()
        reader.stopped = threading.Event()
        reader.latest = object()
        reader.sequence = 0
        broken = MagicMock()
        broken.read.side_effect = DecoderError("decode failed")

        with patch.object(detector.cv2, "error", DecoderError):
            with patch.object(detector, "connect_camera", side_effect=[broken, None]) as connect:
                with patch.object(reader.stopped, "wait", side_effect=lambda _: reader.stopped.set() if connect.call_count == 2 else False):
                    reader._read()
                self.assertEqual(connect.call_count, 2)
        broken.release.assert_called_once()
        self.assertIsNone(reader.latest)


if __name__ == "__main__":
    unittest.main()
