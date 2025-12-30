"""
Flask backend for SafeRoute

Endpoints:
- GET /           -> serves frontend/index.html
- GET /<path>     -> serves static files (map.html, style.css, map.js)
- POST /score_route -> accepts { "routes": [ [ [lat,lon], ... ], ... ] }
                     returns { "scores": [float,...] } (lower = safer)

Scoring:
- Predicts crime intensity at every route point using the trained model.
- Applies a mild non-linear penalty to high-risk points so high-crime segments
  influence the route score more strongly (makes safest route selection meaningful).
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import joblib
import numpy as np
import os

# --- Robust Path Setup ---
# Get the absolute path of this script’s directory (e.g., .../backend)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to frontend and model file
STATIC_FOLDER = os.path.join(BASE_DIR, "../frontend")
MODEL_PATH = os.path.join(BASE_DIR, "model.joblib")

# --- App Initialization ---
app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path="/")
CORS(app)

# --- Model Loading ---
if not os.path.exists(MODEL_PATH):
    print(f"❌ Error: Model not found at {MODEL_PATH}")
    print("Please make sure 'model.joblib' is in the 'backend' directory.")
    print("You may need to run the training script first.")
    raise FileNotFoundError(f"Model not found at {MODEL_PATH}.")

model = joblib.load(MODEL_PATH)
print("✅ Model loaded successfully!")

# --- Routes ---

@app.route("/")
def index():
    """Serves the main entry page (index.html)."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/score_route", methods=["POST"])
def score_route():
    """
    Expects JSON: { "routes": [ [ [lat, lon], ... ], [ ... ] ] }
    Returns: { "scores": [avg_score_for_route,...] }
    Lower score means safer.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    routes = data.get("routes")
    if not routes or not isinstance(routes, list):
        return jsonify({"error": "Missing 'routes' list"}), 400

    scores = []
    for route in routes:
        try:
            arr = np.array(route, dtype=float)  # shape (N,2) lat, lon
            if arr.ndim != 2 or arr.shape[1] != 2:
                raise ValueError("Route should be list of [lat, lon] pairs")

            # Predict crime intensity at each point
            preds = model.predict(arr)

            # Non-linear penalty: emphasize top-risk points (top 15%)
            p85 = np.percentile(preds, 85)
            penalized = np.where(preds >= p85, preds * 1.6, preds)

            # Compute average of penalized values
            route_score = float(np.mean(penalized))
            scores.append(route_score)

        except Exception as e:
            print(f"⚠️ Error scoring route: {e}")
            # Fallback to a high penalty so this route is considered unsafe
            scores.append(float("inf"))

    return jsonify({"scores": scores})


@app.route("/<path:path>")
def static_proxy(path):
    """
    Serves any other static file from the frontend folder.
    Enables map.html, style.css, map.js, etc.
    """
    return send_from_directory(app.static_folder, path)


# --- Run the App ---
if __name__ == "__main__":
    print("🚀 Starting Flask server...")
    print(f"📂 Serving static files from: {STATIC_FOLDER}")
    print(f"📘 Using model: {MODEL_PATH}")
    app.run(host="0.0.0.0", port=5000, debug=True)
