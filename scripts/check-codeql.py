"""Fail on blocking SARIF results, honoring only API routes covered by the 429 regression test."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
ROUTES = {(entry["source"], entry["method"], entry["url"])
          for entry in json.loads((ROOT / "scripts/rate-limited-routes.json").read_text())}
ROUTE = re.compile(r"\s*app\.(get|post)(?:<[^\n]*?>)?\('(/api/[^']+)'")

def guarded_route(path, line):
    if path not in {entry[0] for entry in ROUTES} or not isinstance(line, int) or line < 1:
        return False
    lines = (ROOT / path).read_text().splitlines()
    match = ROUTE.match(lines[line - 1]) if line <= len(lines) else None
    return bool(match and (path, match[1].upper(), match[2]) in ROUTES)

def main(directory):
    reports = list(Path(directory).rglob("*.sarif"))
    if not reports:
        raise SystemExit("CodeQL produced no SARIF.")
    blocking = []
    for report in reports:
        for run in json.loads(report.read_text())["runs"]:
            components = [run["tool"]["driver"], *run["tool"].get("extensions", [])]
            rules = {rule["id"]: rule for component in components for rule in component.get("rules", [])}
            for result in run.get("results", []):
                rule_id = result["ruleId"]
                rule = rules[rule_id]
                severity = float(rule.get("properties", {}).get("security-severity", 0))
                if result.get("level", rule.get("defaultConfiguration", {}).get("level")) != "error" and severity < 7:
                    continue
                location = result["locations"][0]["physicalLocation"]
                path = location["artifactLocation"].get("uri")
                region = location.get("region", {})
                if rule_id == "js/missing-rate-limiting" and guarded_route(path, region.get("startLine")):
                    print("Global Fastify 429 regression check covers", path, region["startLine"])
                    continue
                blocking.append((rule_id, path, region, result.get("message", {}).get("text")))
    if blocking:
        raise SystemExit(f"Blocking CodeQL findings: {blocking}")

if __name__ == "__main__":
    main(sys.argv[1])
