#!/usr/bin/env python3

from typing import List, Dict, Any, TypedDict

import argparse
import json
import os
import sys
import bz2
import time
import csv
import html
import requests

from datetime import datetime

from fetch import Stats

LOCATIONS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQI5mKXOKUOTxB4xKu3WoC5qSyEBOeDi_E0E1iCHR50UcgYDHh4_FAXVdRCAviTkCNGNqnk25Dzg8nx/pub?output=csv"

class TimePoint(TypedDict):
    y: int
    t: int

class StatsResult(TypedDict):
    timestamp: int
    money: List[TimePoint]
    completed: List[TimePoint]
    inprogress: List[TimePoint]
    free: List[TimePoint]

class LocationData(TypedDict):
    fillKey: str
    messages: List[str]

def load_json(path: str, results: List[Dict[str, Any]]) -> None:
    with open(path, "r") as f:
        data = json.load(f)
    results.append(data)

def load_json_bz2(path: str, results: List[Dict[str, Any]]) -> None:
    with bz2.open(path, "rt") as f:
        data = json.load(f)
    results.extend(data)

def write_json_bz2(backup_dir: str, data_backups: List[Dict[str, Any]]) -> None:
    path = os.path.join(backup_dir, datetime.now().strftime("%Y%m%dT%H%M.json.bz2"))
    try:
        with bz2.open(path, "wt") as f:
            json.dump(data_backups, f)
    except Exception:
        os.remove(path)
        raise

def process_locations() -> None:
    res: Dict[str, LocationData] = {}

    req = requests.get(LOCATIONS_CSV_URL, stream=True)
    req.raise_for_status()
    req.encoding = 'utf-8'

    reader = csv.reader(req.iter_lines(decode_unicode=True))
    next(reader) # column headers
    for code, comment in reader:
        if code in res:
            res[code]["messages"].append(html.escape(comment))
        else:
            res[code] = { "fillKey": "sent", "messages": [ html.escape(comment) ] }

    with open("locations.json", "w") as f:
        json.dump(res, f)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output_file", help="Path to the JSON output", default="stats.json")
    parser.add_argument("-b", "--backup-dir", help="Path where to store the backups", default="backup")
    parser.add_argument("-c", "--compress", help="compress backup files", action="store_true")
    args = parser.parse_args()


    if not os.path.isdir(args.backup_dir):
        print(f"{args.backup_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    data_backups: List[Dict[str, Any]] = []
    loaded_files: List[str] = []
    for fn in os.listdir(args.backup_dir):
        path = os.path.join(args.backup_dir, fn)
        if path.endswith(".json"):
            load_json(path, data_backups)
        elif path.endswith(".json.bz2"):
            load_json_bz2(path, data_backups)
        else:
            continue
        loaded_files.append(path)

    data_backups.sort(key=lambda it: it.get("timestamp", 0))

    stats_result: StatsResult = {
        "timestamp": int(time.time()),
        "money": [],
        "completed": [],
        "inprogress": [],
        "free": [],
    }

    for d in data_backups:
        if "stats" not in d:
            continue

        ts = d["timestamp"]
        stats: Stats = d["stats"]

        for k in stats_result.keys():
            val = stats.get(k, None)
            if val is not None:
                stats_result[k].append({ "t": ts, "y": val}) # type:ignore

    with open(args.output_file, "w") as f:
        json.dump(stats_result, f)

    if args.compress and len(loaded_files) > 1:
        write_json_bz2(args.backup_dir, data_backups)
        for p in loaded_files:
            os.remove(p)

    process_locations()
