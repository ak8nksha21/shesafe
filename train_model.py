"""
train_model.py

- Reads "crime 2.csv"
- Trains a KNeighborsRegressor on (lat, long) -> totalcrime
- Uses distance-weighted KNN so predictions reflect nearby crime counts strongly
- Saves model to backend/model.joblib
"""

import os
import pandas as pd
import numpy as np
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib

CSV = "crime 2.csv"          # must be at project root
OUT = "backend/model.joblib" # model output path

if not os.path.exists(CSV):
    raise FileNotFoundError(f"{CSV} not found. Put your file in the project root.")

df = pd.read_csv(CSV)

# Required columns are 'lat','long' and 'totalcrime' (we saw these in your file)
for c in ("lat", "long"):
    if c not in df.columns:
        raise KeyError(f"Column '{c}' not found in CSV. Found: {df.columns.tolist()}")

# If 'totalcrime' exists use it; otherwise sum common columns to create a target
if "totalcrime" in df.columns:
    target = "totalcrime"
else:
    # try to create a sensible target from available crime columns
    crime_cols = [c for c in df.columns if c.lower() in ("murder","rape","robbery","theft","assualt murders","sexual harassement","gangrape")]
    if not crime_cols:
        raise KeyError("No 'totalcrime' and no recognizable crime columns found.")
    df["totalcrime"] = df[crime_cols].sum(axis=1)
    target = "totalcrime"

# Drop rows without coordinates or target
df = df.dropna(subset=["lat", "long", target]).reset_index(drop=True)

X = df[["lat", "long"]].values
y = df[target].astype(float).values

# Pipeline: standardize then KNN with distance weighting (closer crime points have larger impact)
pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("knn", KNeighborsRegressor(n_neighbors=8, weights="distance"))
])

pipeline.fit(X, y)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
joblib.dump(pipeline, OUT)
print(f"✅ Trained KNN on {len(df)} points and saved model to {OUT}")