# Sources Convention

OfferLoom 会自动扫描下面两个目录，并把它们加入可索引来源：

```text
sources/
├── documents/
│   └── <guide-source>/
└── question-banks/
    └── <question-bank-source>/
```

约定：

- `sources/documents/<name>/` 放主线学习文档仓库或整理后的本地文档集合。
- `sources/question-banks/<name>/` 放面经题库、问答合集或整理后的 markdown 文档。
- 新增目录后，打开设置页即可看到自动发现结果；保存并重建索引后会进入站点。
- 如果你不想自动识别某个目录，把它移出 `sources/` 即可。
