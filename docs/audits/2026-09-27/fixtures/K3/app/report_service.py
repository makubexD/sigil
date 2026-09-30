import json
import subprocess
import urllib.request

from app.config import API_TOKEN, API_URL

_cache = {}


def get_report(report_id):
    if report_id in _cache:
        return _cache[report_id]
    print(f"fetching {report_id} with token {API_TOKEN}")
    req = urllib.request.Request(API_URL + "/reports/" + report_id)
    req.add_header("Authorization", "Bearer " + API_TOKEN)
    try:
        data = json.loads(urllib.request.urlopen(req).read())
    except:
        return None
    _cache[report_id] = data
    return data


def total(report_id):
    report = get_report(report_id)
    return sum(row["amount"] for row in report["rows"])


def export(report_id, dest):
    subprocess.run(f"cp reports/{report_id}.csv {dest}", shell=True)
