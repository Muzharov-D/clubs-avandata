"""Set pieces aggregate (page 13)."""
from ._helpers import vps, zero


def parse(text):
    return {
        "throwIns":         vps([r"THROW-INS", r"ВБРАСЫВАНИЯ"], text) or zero(),
        "freeKicks":        vps([r"FREE KICKS", r"ШТРАФНЫЕ"], text) or zero(),
        "freeKicksWithShot": zero(),
        "penalty":          vps([r"PENALTY", r"ПЕНАЛЬТИ"], text) or zero(),
        "penaltyWithShot":  zero(),
        "corners":          vps([r"CORNERS", r"УГЛОВЫЕ"], text) or zero(),
        "offsides":         vps([r"OFFSIDES", r"ОФСАЙДЫ"], text) or zero(),
    }
