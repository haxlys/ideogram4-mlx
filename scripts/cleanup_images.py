#!/usr/bin/env python3
"""Report or delete orphan images in the Ideogram 4 SQLite database."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

from db import delete_orphan_images, get_image_stats, init_db  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print image linkage statistics (default when no action is given).",
    )
    parser.add_argument(
        "--delete-orphans",
        action="store_true",
        help="Delete images with no valid history prompt (NULL or dangling prompt_id).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --delete-orphans, report what would be deleted without changing data.",
    )
    args = parser.parse_args()

    init_db()
    stats = get_image_stats()

    if not args.delete_orphans:
        print("Image linkage report")
        print(f"  total:            {stats['total']}")
        print(f"  linked:           {stats['linked']}")
        print(f"  orphans:          {stats['orphans']}")
        print(f"    null prompt_id: {stats['null_prompt_id']}")
        print(f"    dangling:       {stats['dangling']}")
        if not args.report and stats["orphans"] == 0:
            return 0
        if not args.report:
            print("\nUse --delete-orphans to remove orphan images.")
        return 0

    if args.dry_run:
        print(f"Would delete {stats['orphans']} orphan image(s).")
        print(f"  null prompt_id: {stats['null_prompt_id']}")
        print(f"  dangling:       {stats['dangling']}")
        return 0

    deleted = delete_orphan_images()
    print(f"Deleted {deleted} orphan image(s).")
    after = get_image_stats()
    print(f"Remaining: {after['total']} total, {after['linked']} linked, {after['orphans']} orphans.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())