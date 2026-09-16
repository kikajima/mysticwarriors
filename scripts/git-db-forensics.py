#!/usr/bin/env python3
"""Analisa contas em cada snapshot git do banco (db/custom.db + wal)."""
import sqlite3
import subprocess
import sys
import os
import tempfile

REPO = "/home/z/my-project"
COMMITS = [
    "e7d0c12",  # v0.3 manual
    "6d7fedb",  # snapshot 20:02 Sep 10
    "d5892fe",  # snapshot 22:24 Sep 10
    "e8f7f03",  # snapshot 02:48 Sep 11
    "2a838ef",  # snapshot 12:39 Sep 11
]

def git(*args):
    return subprocess.run(["git", "-C", REPO] + list(args), capture_output=True, text=True)

def extract(commit, path, dest):
    r = git("show", f"{commit}:{path}")
    if r.returncode != 0:
        return False
    with open(dest, "wb") as f:
        f.write(r.stdout.encode("latin1") if isinstance(r.stdout, str) else r.stdout)
    # git show via text mode corrupts binary; use raw
    return True

def extract_raw(commit, path, dest):
    r = subprocess.run(["git", "-C", REPO, "show", f"{commit}:{path}"], capture_output=True)
    if r.returncode != 0:
        return False
    with open(dest, "wb") as f:
        f.write(r.stdout)
    return True

def query_db(db_path):
    try:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Account'")
        if not cur.fetchone():
            return "sem tabela Account"
        cur.execute("SELECT COUNT(*) FROM Account")
        total = cur.fetchone()[0]
        cur.execute("SELECT username, isGuest, createdAt, updatedAt FROM Account ORDER BY createdAt")
        rows = cur.fetchall()
        con.close()
        return f"total={total} -> " + "; ".join(f"{u or '(guest)'} g={g} criada={c} upd={u2}" for u, g, c, u2 in rows)
    except Exception as e:
        return f"ERRO: {e}"

for c in COMMITS:
    with tempfile.TemporaryDirectory() as td:
        dbp = os.path.join(td, "custom.db")
        ok = extract_raw(c, "db/custom.db", dbp)
        if not ok:
            print(f"{c}: db/custom.db não existe neste commit")
            continue
        # também extrai wal se existir
        extract_raw(c, "db/custom.db-wal", dbp + "-wal")
        extract_raw(c, "db/custom.db-shm", dbp + "-shm")
        info = subprocess.run(["git", "-C", REPO, "show", "-s", "--format=%ci", c], capture_output=True, text=True).stdout.strip()
        print(f"=== {c} ({info}) ===")
        print("   ", query_db(dbp))
