#!/bin/bash
cd "$(dirname "$0")"
for r in 1 2 3; do for t in 4 6; do for c in now c243 now-rm; do
  node measure.mjs $c $t $r 2>&1 | tail -1
done; done; done
for r in 1 2 3; do for c in now c243; do
  node measure.mjs $c 4 $r --profile 2>&1 | tail -1
done; done
echo ALLDONE
