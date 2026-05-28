"""Recoveries & tackling aggregate (page 17)."""
from ._helpers import vps, num, zero


def parse(text):
    return {
        "recoveriesAndTackling": vps([r"RECOVERIES &\s*TACKLING", r"RECOVERIES &", r"ОТБОРЫ И\s*ПОДБОРЫ", r"ОТБОРЫ И"], text) or zero(),
        "inFirstThird":  vps([r"IN FIRST\s*THIRD", r"В 1-Й\s*ТРЕТИ"], text) or zero(),
        "inSecondThird": vps([r"IN SECOND\s*THIRD", r"ВО 2-Й\s*ТРЕТИ"], text) or zero(),
        "inThirdThird":  vps([r"IN THIRD\s*THIRD", r"В 3-Й\s*ТРЕТИ"], text) or zero(),
        "slidingTackles": vps([r"SLIDING TACKLES", r"ПОДКАТЫ"], text) or zero(),
        "returns":       num([r"RETURNS", r"ВОЗВРАТЫ"], text, 0),
        "returnsByThird": {"first": 0, "second": 0, "third": 0},
        "tacklesLine":  num([r"TACKLES LINE", r"ЛИНИЯ ОТБОРОВ"], text, 0.0),
    }
