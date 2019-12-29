import requests
import sys
import json
import argparse
import re
import time

from bs4 import BeautifulSoup
from collections import namedtuple
from concurrent.futures import ThreadPoolExecutor, as_completed


Wish = namedtuple("Wish", [ "id", "typ", "name", "age", "thing", "text", "place", "price" ])

def get_td_text(row, class_, suffixToRemove=None, contentToRemove=None):
    td = row.find("td", class_=class_)
    if not td:
        return ""
    nodes = [ n.strip() for n in td.findAll(text=True) if n.strip() != "" ]
    res = " ".join(nodes)
    if suffixToRemove is not None and res.endswith(suffixToRemove):
        res = res[:-len(suffixToRemove)]
    if contentToRemove is not None and contentToRemove in res:
        res = res.replace(contentToRemove, "")
    return res

age_re = re.compile(r"(.*) ([0-9]+) let$")
def get_name_age(row):
    val = get_td_text(row, "col-name_")
    m = age_re.search(val)
    if not m:
        return val, 0
    return m.group(1), int(m.group(2))

price_re = re.compile(r'[0-9]+')
def get_price(row):
    val = get_td_text(row, "col-price")
    m = price_re.findall(val)
    if len(val) == 0:
        return None
    if val.startswith("do "):
        return (0, int(m[0]))
    elif val.startswith("nad "):
        return (int(m[0]), 1000000)
    return (int(m[0]), int(m[1]))

def process_wish_page(typ, page, result):
    typStr = "darek" if typ == 2 else "zazitek"
    params = {
        "type": typ,
        "grid-page": page,
        "locale": "cs",
        "grid-per_page": 50,
    }
    for i in range(5):
        req = requests.get("https://jeziskovavnoucata.rozhlas.cz/prani/" + typStr, params=params, timeout=30)
        if req.status_code == 200:
            break
        print("Failed to download wishes #%d: %d %s", i, req.status_code, req.text, file=sys.stderr)

    if req.status_code != 200:
        return

    bs = BeautifulSoup(req.text, "html.parser")

    table = bs.find("tbody", id="snippet-grid-tbody")
    rows = table.find_all("tr")
    for row in rows:
        if not row.has_attr("data-id"):
            return False

        name, age = get_name_age(row)
        w = Wish(
            id=int(row["data-id"]),
            typ="dárek" if typ == 2 else "zážitek",
            name=name,
            age=age,
            thing=get_td_text(row, "col-description", suffixToRemove=" Proč si to přeji"),
            text=get_td_text(row, "col-descriptionWhy", contentToRemove=" ... více\xa0>>"),
            place=get_td_text(row, "col-place"),
            price=get_price(row),
        )

        print(w)
        result.setdefault(w.place, []).append(w)
    return len(rows) >= params["grid-per_page"]

def get_coords(place):
    params = {
        "format": "json",
        "q": place + ", Czechia",
    }
    for i in range(5):
        req = requests.get("http://nominatim.openstreetmap.org/search", params=params, timeout=60)
        if req.status_code == 200:
            break
        print("Failed to download place #%d %s: %d %s", i, place, req.status_code, req.text, file=sys.stderr)
    if req.status_code != 200:
        return None
    coords = req.json()
    if len(coords) != 0:
        return ( coords[0]['lat'], coords[0]['lon'] )
    if "-" in place:
        idx = place.find("-")
        return get_coords(place[:idx])
    return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output_file", help="Path to the JSON output")
    parser.add_argument("-c", "--cache", help="Path to cache file for place coordinates", default="place_cache.json")
    args = parser.parse_args()

    placeWishMap = {}
    placeCoords = {}

    try:
        with open("place_cache.json", "r") as f:
            placeCoords = json.load(f)
    except Exception as e:
        pass

    for typ in range(2, 4):
        more = True
        page = 1
        while more:
            more = process_wish_page(typ, page, placeWishMap)
            page += 1

    with ThreadPoolExecutor(max_workers=8) as ex:
        placeFutMap = {}
        for place in placeWishMap.keys():
            if place not in placeCoords:
                placeFutMap[ex.submit(get_coords, place)] = place

        for fut in as_completed(placeFutMap):
            place = placeFutMap[fut]
            try:
                coords = fut.result()
                if coords is not None:
                    placeCoords[place] = coords
                else:
                    print("Failed to find coords for '%s'" % place, file=sys.stderr)
                print(place, coords)
            except Exception as e:
                print(place, e)

    size = 0
    for k, v in placeWishMap.items():
        size += len(v)
    print(size)

    result = []
    for place, coords in placeCoords.items():
        if place not in placeWishMap:
            continue
        wishes = placeWishMap[place]
        result.append({
            "name": place,
            "coords": coords,
            "wishes": [ w._asdict() for w in wishes ],
        })

    with open(args.output_file, "w") as f:
        json.dump({
            "timestamp": int(time.time()),
            "places": result,
        }, f)

    with open("place_cache.json", "w") as f:
        json.dump(placeCoords, f)
