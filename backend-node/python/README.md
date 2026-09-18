# Station detector

The detector uses the existing `yolov8s.pt` model and JPEG preview transport.
For a configured ROI, inference uses its bounding rectangle plus 15% context
(at least 32 pixels), instead of masking and shrinking the entire camera image.
Boxes are translated back to the original image before applying the existing
box-center-in-polygon rule. Draw the ROI around the people to be counted.
Without an ROI, inference uses the full image.

The inference size remains 640. Cropping allocates more of those pixels to the
waiting area; improvements on distant people must be measured on actual footage.
This change does not retrain the model or infer whether a person intends to ride.

API references: [NumPy image inputs and inference size](https://docs.ultralytics.com/modes/predict/)
and [persistent tracking](https://docs.ultralytics.com/modes/track/).

Occupancy changes require repeated identical counts: at least 0.5 seconds for
increases and 1 second for decreases. Brief misses/spikes are suppressed, at the
cost of delayed count changes. Boxes show current detections, so they can briefly
differ from the stabilized count. Logs include `raw` and stabilized `waiting`.
After a processing gap over 3 seconds, count history and tracking are reset.

The standalone CLI accepts `--imgsz` and `--confidence` (defaults 640 and 0.3).
Larger inference images increase compute cost. Validate on representative crowded,
empty, backlit and partially occluded scenes before changing these settings.

Run regression tests from the repository root:

```sh
python -m unittest discover -s backend-node/python -p test_detector.py
```

After editing the detector, stop and start detection to launch the updated Python
process. Preview and database update intervals remain unchanged.
