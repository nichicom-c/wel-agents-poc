# AgentCore Chat UI cleanup

この module は private S3 bucket / objects、CloudFront distribution、Origin Access Control、S3 bucket
policy を作成する。学習後は `destroy` する。

API Gateway / Lambda などの BFF 側リソースはこの module の管理外で、[`../bff`](../bff) が
管理する。

## 削除前に確認

```bash
mise exec -- terraform -chdir=terraform/aws/chat-ui state list
mise exec -- terraform -chdir=terraform/aws/chat-ui plan -destroy
```

## 削除

```bash
mise exec -- terraform -chdir=terraform/aws/chat-ui destroy
```

`force_destroy` の default は `true` のため、Terraform 管理の UI asset が bucket 内に残っていても
bucket を削除できる。

## destroy が失敗した場合

- CloudFront distribution の disable / delete には時間がかかる。削除直後の状態反映で失敗した場合は、
  数分待って再実行する。
- `force_destroy = false` に変更している場合、S3 bucket 内の object が残っていると bucket 削除に失敗する。
  不要な object を削除するか、意図して `force_destroy = true` に戻してから再実行する。
- BFF は module 外のため削除されない。不要な場合は [`../bff/cleanup.md`](../bff/cleanup.md) の
  手順で別途削除する。
- `dist/chat-ui/` はローカル生成物であり、AWS resource ではない。
