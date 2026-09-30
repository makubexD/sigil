import os
import yaml

API_URL = "https://reports.example.com/api"
API_TOKEN = os.environ.get("REPORTS_TOKEN", "dev-token-1234")


def load_settings(path):
    with open(path) as f:
        return yaml.load(f, Loader=yaml.Loader)
