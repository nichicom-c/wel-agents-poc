import { useEffect, useState } from "react";

import { fetchMasters } from "../api/masters.ts";
import { EMPTY_MASTERS, type Masters } from "./masters.ts";

/**
 * マスタは Knowledge Review / Admin / Training の3画面が同じものを使い、セッション中に変化
 * しないため、module レベルで1回だけ取得してキャッシュを共有する（画面を切り替えるたびに
 * `/api/masters` を叩かない）。取得に失敗した場合はキャッシュを捨て、次の呼び出しで再試行する。
 */

let pending: Promise<Masters> | undefined;
let cached: Masters | undefined;

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function loadMasters(fetchFn?: FetchFn): Promise<Masters> {
  if (!pending) {
    pending = fetchMasters(fetchFn)
      .then((masters) => {
        cached = masters;
        return masters;
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
  }
  return pending;
}

/** テスト用。module レベルのキャッシュを捨てる。 */
export function resetMastersCache(): void {
  pending = undefined;
  cached = undefined;
}

/**
 * マスタを返す。取得前・取得失敗時は `EMPTY_MASTERS`（select は空、ラベルは id のまま）で、
 * 画面は描画を止めない。
 */
export function useMasters(): Masters {
  const [masters, setMasters] = useState<Masters>(cached ?? EMPTY_MASTERS);

  useEffect(() => {
    let cancelled = false;
    loadMasters()
      .then((loaded) => {
        if (!cancelled) {
          setMasters(loaded);
        }
      })
      .catch(() => {
        // 取得失敗時は EMPTY_MASTERS のまま。id は素通しで表示されるため画面は壊れない。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return masters;
}
