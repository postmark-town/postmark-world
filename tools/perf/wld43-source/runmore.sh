#!/bin/bash
cd "$(dirname "$0")"
for r in 1 2 3; do for t in 4 6; do
  node measure.mjs c243-rm $t $r 2>&1 | tail -1
done; done
for r in 1 2 3; do for c in now c243; do
  node measure.mjs $c 4 $r --nogpu 2>&1 | tail -1
done; done
for r in 1 2 3; do
  node measure.mjs now 6 $r --profile 2>&1 | tail -1
done
echo ALLDONE
