# aws-single-node-prototype-infra

**Single-node / Single-port な即席アプリ向けの AWS インフラ構築ツール**

 EC2 + Cognito (Google OAuth)

---

## 概要

このリポジトリは、
**「即席でアプリと基盤を立ち上げ、必要になれば自由に拡張できる」**
ことを目的とした **プロトタイプ向け AWS インフラ構築ツール**です。

---

## コンセプト

### ❌ 目指していないもの

* 本番前提の完全 IaC
* マルチ AZ / マルチノード構成
* 汎用的な AWS リソーステンプレート
* Terraform / CDK による厳密管理

### ✅ 目指しているもの

* **数分で動作基盤を作れる**
* **AWS Console を自由に触って壊してもよい**
* **「必要になったらAWS Consoleで拡張」**
* **アプリテンプレと思想が一致したインフラ**

---

## 想定するアプリ構成

このツールは、以下のようなアプリ構成を前提にしています。

* 単一 EC2 ノード
* 単一ポート（80 / 443）
* Docker / docker-compose 運用
* アプリ側で SSL 終端（例: Caddy）

※
React / FastAPI に限りませんが、
作者の `react-fastapi-prototype` リポジトリと思想的に対応しています。

---

## 構成概要

### Core

* EC2（Ubuntu 24.04）
* Default VPC / Subnet
* Security Group（22 / 80 / 443）
* UserData による Docker 自動インストール

### Auth（必要であれば）

* Cognito User Pool
* Google OAuth 連携
* SPA 向け OAuth Client（PKCE）
* Hosted UI（Classic）

---

## ディレクトリ構成

```text
.
├── .github/workflows
│   ├── provision-ec2.yml        # EC2 構築（必須）
│   └── provision-cognito.yml    # Cognito 構築（任意）
│
├── infra
│   ├── package.json
│   ├── tsconfig.json
│   ├── aws.ts                   # AWS Client 共通
│   │
│   ├── core
│   │   └── ec2.ts               # EC2 構築ロジック
│   │
│   └── auth
│       └── cognito.ts           # Cognito / Google OAuth
│
└── README.md
```

---

## EC2 構築

### 概要

* Ubuntu 24.04 固定
* Instance type / Region は指定可能
* Default VPC / Subnet を利用
* 80 / 443 / 22 のみ開放
* 初回起動時に Docker を自動インストール

### 実行方法
実行時に、対象となる GitHub Environment（例: app1-dev / app1-prod）を指定してください。
指定した Environment に設定された Secrets（AWS / Google 認証情報）が使用されます。

GitHub Actions の **Actions タブ**から
`Provision EC2` workflow を手動実行します。

### 入力パラメータ
* Environment 名（app1-dev / app1-prod）
* Root volume size (GB)
* Project 名（タグ用）
* Instance Type
* Key Pair 名
* EIP 使用有無
* Region

---

## Cognito 構築（Auth用）

### 位置づけ

Cognito 構築は 認証機能が必要になったら追加して下さい。
EC2 構築とは独立して実行可能です。

Cognito 構築も GitHub Actions の workflow として提供されており、
実行時に 対象となる GitHub Environment を指定します。

### 構築内容

* User Pool
* Google Identity Provider
* Hosted UI（Classic）
* SPA 向け OAuth Client（PKCE）
* email / password 認証も併用可能

### 入力パラメータ
* Environment 名（app1-dev / app1-prod）
* Project 名（User Pool 名）
* Callback URL（例: https://<domain>/）
* Logout URL（省略時は Callback URL を使用）
* Region
---

## GitHub Environments による環境分離

このリポジトリでは **GitHub Environments** を使い、

* アプリ毎
* 開発 / 本番毎

に **認証情報を分離**する運用にしています。

### 環境の例

```text
app1-dev
app1-prod
app2-dev
app2-prod
```

### Environment に設定するもの（Secrets）

* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`
* `GOOGLE_OAUTH_CLIENT_ID`（Auth 使用時）
* `GOOGLE_OAUTH_CLIENT_SECRET`（Auth 使用時）

Secrets は Environment から自動で読み込まれ、
同じ workflow でも **環境を切り替えて実行**できます。

---

## 向いている用途

* PoC
* 技術検証
* 個人開発
* 即席デモ環境
* アプリテンプレ検証用インフラ

---

## 向いていない用途

* 長期運用前提の本番環境
* 厳密な IaC 管理が必要な案件
* 大規模 / 高可用性システム

---
## License

MIT License
