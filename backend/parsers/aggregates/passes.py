"""Passes aggregate (page 15)."""
from ._helpers import vps, num, zero


def parse(text):
    return {
        "forward":      vps([r"FORWARD", r"ПЕРЕДАЧИ ВПЕРЁД", r"ВПЕРЁД"], text) or zero(),
        "back":         vps([r"BACK", r"ПЕРЕДАЧИ НАЗАД", r"НАЗАД"], text) or zero(),
        "sideways":     vps([r"SIDEWAYS", r"ПОПЕРЕЧНЫЕ"], text) or zero(),
        "short":        vps([r"SHORT", r"КОРОТКИЕ"], text) or zero(),
        "middle":       vps([r"MIDDLE", r"СРЕДНИЕ"], text) or zero(),
        "long":         vps([r"LONG", r"ДЛИННЫЕ"], text) or zero(),
        "progressive":  vps([r"PROGRESSIVE", r"ПРОГРЕССИВНЫЕ"], text) or zero(),
        "toFinalThird": vps([r"TO FINAL THIRD", r"В ФИН\.? ТРЕТЬ", r"ФИН\. ТРЕТЬ"], text) or zero(),
        "crosses":      vps([r"CROSSES", r"НАВЕСЫ"], text) or zero(),
        "goalKicks":    vps([r"GOAL KICKS", r"ОТ ВОРОТ"], text) or zero(),
        "oppda":           num([r"OPPDA"], text, 0.0),
        "passesPerMinute": num([r"PASSES PER MINUTE", r"ПЕРЕДАЧ В МИНУТУ"], text, 0.0),
    }
