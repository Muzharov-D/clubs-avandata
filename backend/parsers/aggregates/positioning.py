"""Positioning aggregate (page 20)."""
from ._helpers import vps, num, zero


def parse(text):
    return {
        "shotsAgainst":  vps([r"SHOTS AGAINST", r"УДАРЫ\s*СОПЕРНИКА"], text) or zero(),
        "interceptions": num([r"INTERCEPTIONS", r"ПЕРЕХВАТЫ"], text, 0),
        "clearance":     vps([r"CLEARANCE", r"ВЫНОСЫ"], text) or zero(),
        "fouls":         num([r"FOULS", r"ФОЛЫ"], text, 0),
        "yellowCard":    vps([r"YELLOW CARD", r"ЖЁЛТАЯ КАРТОЧКА"], text) or zero(),
        "redCard":       vps([r"RED CARD", r"КРАСНАЯ\s*КАРТОЧКА"], text) or zero(),
    }
