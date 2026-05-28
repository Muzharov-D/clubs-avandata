"""Shooting aggregate (page 12): totalShots, shotsOnTarget, avgShotDistance, expectedGoals."""
from ._helpers import vps, num, zero


def parse(text):
    ts = vps([r"TOTAL SHOTS", r"ВСЕГО УДАРОВ"], text) or zero()
    if isinstance(ts, dict):
        # totalShots schema uses 'onTarget' instead of 'successful'
        ts = {"value": ts.get("value", 0), "pct": ts.get("pct", 0), "onTarget": ts.get("successful", 0)}
    return {
        "totalShots":      ts,
        "avgShotDistance": num([r"AVG\.? SHOT DISTANCE m\.?", r"AVG\.? SHOT", r"СРЕДНЯЯ ДИСТАНЦИЯ УДАРА", r"СРЕДНЯЯ ДИСТАНЦИЯ"], text, 0.0),
        "shotsOnTarget":   vps([r"SHOTS ON TARGET", r"УДАРЫ В СТВОР"], text) or zero(),
        "expectedGoals":   num([r"EXPECTED GOALS", r"ОЖИДАЕМЫЕ ГОЛЫ", r"ОЖИДАЕМЫЕ"], text, 0.0),
    }
