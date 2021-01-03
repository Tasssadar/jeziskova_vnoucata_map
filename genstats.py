#!/usr/bin/env python3

from typing import List, Dict, Any, TypedDict

import argparse
import os
import sys
import bz2
import time
import csv
import html
import requests
import ujson

from datetime import datetime

from fetch import Stats

LOCATIONS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQI5mKXOKUOTxB4xKu3WoC5qSyEBOeDi_E0E1iCHR50UcgYDHh4_FAXVdRCAviTkCNGNqnk25Dzg8nx/pub?output=csv"

class TimePoint(TypedDict):
    y: int
    t: int

class StatsResult(TypedDict):
    timestamp: int
    money: List[TimePoint]
    money_inc: List[TimePoint]
    completed: List[TimePoint]
    inprogress: List[TimePoint]
    free: List[TimePoint]

class LocationData(TypedDict):
    fillKey: str
    messages: List[str]

def dedup_wishes(wishes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    res: Dict[int, Dict[str, Any]] = { }

    for w in wishes:
        if w["id"] not in res:
            res[w["id"]] = w
    return list(res.values())

def load_json(path: str, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    with open(path, "r") as f:
        data = ujson.load(f)
    for p in data["places"]:
        p["wishes"] = dedup_wishes(p["wishes"])
    return data # type: ignore

def load_json_bz2(path: str, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    with bz2.open(path, "rt") as f:
        for line in f:
            data = ujson.loads(line)
            del data["places"] # places are unused in stats
            res.append(data)
    return res

def write_json_bz2(backup_dir: str, data_backups: List[Dict[str, Any]]) -> None:
    path = os.path.join(backup_dir, datetime.now().strftime("%Y%m%dT%H%M.json.bz2"))
    try:
        with bz2.open(path, "wt") as f:
            for it in data_backups:
                f.write(ujson.dumps(it))
                f.write("\n")
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
        ujson.dump(res, f)

def decimate_series(series: List[TimePoint]) -> List[TimePoint]:
    if not series:
        return []

    res: List[TimePoint] = [ series[-1] ]
    last_tm = series[-1]["t"]
    for p in reversed(series):
        if last_tm - p["t"] >= 8*60*60:
            res.insert(0, p)
            last_tm = p["t"]
    return res

def generate_daily_inc(series: List[TimePoint]) -> List[TimePoint]:
    if not series:
        return []

    res: List[TimePoint] = []
    last_dt = datetime.fromtimestamp(series[0]["t"])
    last_val = series[0]["y"]
    inc = 0.0
    for p in series[1:]:
        dt = datetime.fromtimestamp(p["t"])
        if dt.date() > last_dt.date():
            delta = dt.date() - last_dt.date()
            inc /= delta.days
            if delta.days > 1:
                last_val = p["y"]
            for i in range(delta.days):
                res.append({ "t": int(last_dt.timestamp() + i*86400), "y": int(inc) })
            last_dt = dt
            inc = 0
        inc += p["y"] - last_val
        last_val = p["y"]
    res.append({ "t": int(last_dt.timestamp()), "y": int(inc) })
    return res

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output_file", help="Path to the JSON output", default="stats.json")
    parser.add_argument("-b", "--backup-dir", help="Path where to store the backups", default="backup")
    parser.add_argument("-c", "--compress", help="compress backup files", action="store_true")
    args = parser.parse_args()

    if not os.path.isdir(args.backup_dir):
        print(f"{args.backup_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    standalone_data: List[Dict[str, Any]] = []
    data_backups: List[Dict[str, Any]] = []
    loaded_jsons: List[str] = []
    for fn in os.listdir(args.backup_dir):
        path = os.path.join(args.backup_dir, fn)
        if path.endswith(".json"):
            data = load_json(path, data_backups)
            standalone_data.append(data)
            data_backups.append(data)
            loaded_jsons.append(path)
        elif path.endswith(".json.bz2"):
            data_backups.extend(load_json_bz2(path, data_backups))
        else:
            continue

    data_backups.sort(key=lambda it: it.get("timestamp", 0))
    standalone_data.sort(key=lambda it: it.get("timestamp", 0))

    stats_result: StatsResult = {
        "timestamp": int(time.time()),
        "money": [],
        "money_inc": [],
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

    stats_result["money_inc"] = generate_daily_inc(stats_result["money"])

    for k, v in stats_result.items():
        if isinstance(v, list):
            stats_result[k] = decimate_series(v) #type:ignore

    with open(args.output_file, "w") as f:
        ujson.dump(stats_result, f)

    if args.compress and len(loaded_jsons) > 72:
        write_json_bz2(args.backup_dir, standalone_data)
        for p in loaded_jsons:
            os.remove(p)

    process_locations()
