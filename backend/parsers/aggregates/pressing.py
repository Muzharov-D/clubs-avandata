"""Pressing aggregate (page 19): 3 plain numbers."""
from ._helpers import num


def parse(text):
    return {
        "pressing":        num(["PRESSING", "ПРЕССИНГ"], text, 0),
        "counterpressing": num(["COUNTERPRESSING", "КОНТРПРЕССИНГ"], text, 0),
        "averagePPDA":     num(["AVERAGE PPDA", "СРЕДНИЙ PPDA"], text, 0.0),
    }
