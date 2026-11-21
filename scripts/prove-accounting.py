"""Check integer obligations used in successful Solidity accounting transitions.

Run with z3-solver==4.13.3.0. Solidity's checked operations revert on overflow.
This proof covers the mathematical result of non-reverting calls.
"""
from pathlib import Path
import re
from z3 import Ints, Or, Solver, unsat

source = Path("contracts/src/HyperHive.sol").read_text()
weights = re.search(r"uint256 w=amount\*(\d+)/10000;uint256 a=amount\*(\d+)/10000;uint256 b=amount\*(\d+)/10000;uint256 t=amount-w-a-b;", source)
if not weights or "tally[hour][winner]>r.total/2" not in source:
    raise SystemExit("Production accounting changed. Review the proof obligations.")
amount, left, right, total = Ints("amount left right total")
workers, auditors, burn = [amount * int(x) / 10000 for x in weights.groups()]
treasury = amount - workers - auditors - burn
proofs = {
    "split conservation and nonnegative recipients": (
        [amount >= 0], Or(workers < 0, auditors < 0, burn < 0, treasury < 0,
                          workers + auditors + burn + treasury != amount)),
    "unique strict-majority tuple for disjoint voting weights": (
        [total > 0, left >= 0, right >= 0, left + right <= total],
        (left > total / 2) & (right > total / 2)),
}
for name, (constraints, violation) in proofs.items():
    solver = Solver()
    solver.add(*constraints, violation)
    if solver.check() != unsat:
        raise SystemExit(f"Unproven: {name}")
    print(f"Proved {name}")
