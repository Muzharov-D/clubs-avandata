"""Duels aggregate (page 18): totalDuels, aerialDuels."""
from ._helpers import vps, vps_before, zero


def parse(text):
    total = vps([r"TOTAL DUELS", r"ВСЕГО\s*ЕДИНОБОРСТВ", r"ВСЕГО"], text) or zero()
    aerial = vps([r"AERIAL DUELS", r"ВЕРХОВЫЕ\s*ЕДИНОБОРСТВА"], text)
    if not aerial or aerial == total:
        # 2011 layout: aerial pair comes BEFORE 'ЕДИНОБОРСТВА' anchor
        aerial = vps_before("ЕДИНОБОРСТВА", text) or zero()
    return {"totalDuels": total, "aerialDuels": aerial}
