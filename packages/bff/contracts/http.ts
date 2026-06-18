/** BFF が返す JSON response の共通 header。 */
export const BFF_JSON_HEADERS = {
  "content-type": "application/json",
} as const;

/** BFF core が受け取る最小 HTTP request。API Gateway / Bun Request から変換して渡す。 */
export type BffHttpRequest = {
  /** JSON 文字列の request body。base64 の場合は `isBase64Encoded` を併用する。 */
  body?: string | null;
  /** API Gateway から base64 body として渡されたかどうか。 */
  isBase64Encoded?: boolean;
  /** HTTP method。 */
  method: string;
  /** routing に使う path。 */
  path: string;
  /** URL query parameters。必要な handler だけが読む。 */
  query?: Record<string, string | undefined>;
};

/** BFF core が返す Lambda 互換の HTTP response。 */
export type BffHttpResponse = {
  /** JSON 文字列化済みの response body。 */
  body: string;
  /** JSON response header。 */
  headers: typeof BFF_JSON_HEADERS;
  /** この BFF は常に plain JSON を返す。 */
  isBase64Encoded: false;
  /** HTTP status code。 */
  statusCode: number;
};
