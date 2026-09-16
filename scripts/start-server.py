#!/usr/bin/env python3
"""Inicia o dev server como daemon verdadeiro (double-fork), sobrevivendo ao shell."""
import os
import sys

if os.fork() > 0:
    sys.exit(0)  # pai sai imediatamente

os.setsid()

if os.fork() > 0:
    sys.exit(0)  # primeiro filho sai — o neto é reparentado para o init

# redireciona E/S para o dev.log
log = open('/home/z/my-project/dev.log', 'ab', buffering=0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
devnull = open('/dev/null', 'r')
os.dup2(devnull.fileno(), 0)

os.chdir('/home/z/my-project')
os.execvp('bun', ['bun', 'run', 'dev'])
