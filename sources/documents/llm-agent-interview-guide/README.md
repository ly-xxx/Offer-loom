# 🔥 大模型 & Agent 面试八股文完全指南

> LLM & Agent Interview Preparation Guide — 覆盖 Transformer、推理优化、微调对齐、RAG、Agent、安全评估等核心面试题

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Lau-Jonathan/LLM-Agent-Interview-Guide?style=social)](https://github.com/Lau-Jonathan/LLM-Agent-Interview-Guide)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-2026.02-brightgreen)]()

---

## 📋 目录结构

| 序号 | 模块 | 核心内容 | 链接 |
|------|------|----------|------|
| 01 | **基础知识** | Transformer、Tokenization、Loss & 优化 | [📖 进入](01-Foundation/) |
| 02 | **推理优化** | KV Cache、解码策略、量化部署 | [📖 进入](02-Inference/) |
| 03 | **微调对齐** | PEFT/LoRA、RLHF/DPO/GRPO、指令微调 | [📖 进入](03-FineTuning/) |
| 04 | **RAG** | 检索增强生成全流程 | [📖 进入](04-RAG/) |
| 05 | **Agent** | ReAct、Function Calling、MCP、多智能体 | [📖 进入](05-Agent/) |
| 06 | **安全评估** | 安全对齐、幻觉、评估体系 | [📖 进入](06-Safety-Evaluation/) |
| 07 | **前沿热点** | DeepSeek、MoE、推理模型、2025-2026 趋势 | [📖 进入](07-HotTopics/) |
| 08 | **手撕代码** | Attention、LoRA、BPE、Beam Search 等实现 | [📖 进入](08-Coding/) |
| 09 | **系统设计** | 大模型服务架构、训练系统设计 | [📖 进入](09-SystemDesign/) |
| 10 | **大厂真题** | 字节跳动、阿里、腾讯等真实面试题 | [📖 进入](10-RealQuestions/) |

---

## 🏆 字节跳动 Top 20 高频面试题

> 基于 2025-2026 年牛客网真实面经整理，按出现频率排序

| 排名 | 题目 | 出现频率 | 所属模块 |
|------|------|----------|----------|
| 1 | GRPO 原理，与 PPO/DPO 的区别 | ⭐⭐⭐⭐⭐ | 微调对齐 |
| 2 | Self-Attention 计算过程及复杂度 | ⭐⭐⭐⭐⭐ | 基础知识 |
| 3 | KV Cache 原理及显存计算 | ⭐⭐⭐⭐⭐ | 推理优化 |
| 4 | 手写 Self-Attention / Multi-Head Attention | ⭐⭐⭐⭐⭐ | 手撕代码 |
| 5 | LoRA / QLoRA 原理及秩的选择 | ⭐⭐⭐⭐ | 微调对齐 |
| 6 | PPO 四个组件及训练流程 | ⭐⭐⭐⭐ | 微调对齐 |
| 7 | RAG 全流程及优化方案 | ⭐⭐⭐⭐ | RAG |
| 8 | Agent 记忆系统设计 | ⭐⭐⭐⭐ | Agent |
| 9 | MCP 协议原理，与 Function Calling 对比 | ⭐⭐⭐⭐ | Agent |
| 10 | Flash Attention 原理 | ⭐⭐⭐⭐ | 推理优化 |
| 11 | ReAct 框架原理及实现 | ⭐⭐⭐⭐ | Agent |
| 12 | BPE / WordPiece 分词算法 | ⭐⭐⭐ | 基础知识 |
| 13 | RoPE 旋转位置编码原理 | ⭐⭐⭐ | 基础知识 |
| 14 | MoE 稀疏专家模型原理 | ⭐⭐⭐ | 前沿热点 |
| 15 | DeepSeek 系列模型架构创新 | ⭐⭐⭐ | 前沿热点 |
| 16 | 模型量化 (INT8/INT4/GPTQ/AWQ) | ⭐⭐⭐ | 推理优化 |
| 17 | DPO 数学推导 | ⭐⭐⭐ | 微调对齐 |
| 18 | 大模型幻觉问题与缓解方案 | ⭐⭐⭐ | 安全评估 |
| 19 | Speculative Decoding 投机解码 | ⭐⭐⭐ | 推理优化 |
| 20 | 多智能体协作架构设计 | ⭐⭐⭐ | Agent |

---

## 🎯 使用建议

### 准备路径推荐

```
基础知识 → 推理优化 → 微调对齐 → RAG → Agent → 手撕代码 → 大厂真题
```

### 不同阶段侧重

| 阶段 | 重点 | 建议时间 |
|------|------|----------|
| 基础夯实 | 01 基础知识 + 08 手撕代码 | 3-5 天 |
| 核心强化 | 02 推理 + 03 微调 + 04 RAG | 3-5 天 |
| Agent 专项 | 05 Agent 全部内容 | 2-3 天 |
| 前沿热点 | 07 热点 + 06 安全 | 1-2 天 |
| 模拟冲刺 | 10 大厂真题 + 09 系统设计 | 2-3 天 |

---

## 📚 推荐资源

### 经典论文
- [Attention Is All You Need (2017)](https://arxiv.org/abs/1706.03762)
- [BERT (2018)](https://arxiv.org/abs/1810.04805)
- [GPT-3 (2020)](https://arxiv.org/abs/2005.14165)
- [InstructGPT / RLHF (2022)](https://arxiv.org/abs/2203.02155)
- [LLaMA (2023)](https://arxiv.org/abs/2302.13971)
- [DPO (2023)](https://arxiv.org/abs/2305.18290)
- [DeepSeek-V3 (2024)](https://arxiv.org/abs/2412.19437)
- [GRPO (2025)](https://arxiv.org/abs/2402.03300)

### 开源面试资源
- [llmgenai/LLMInterviewQuestions](https://github.com/llmgenai/LLMInterviewQuestions) ⭐1.7k
- [KalyanKS-NLP/LLM-Interview-Questions](https://github.com/KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub) ⭐700+

---

## 📊 项目统计

- 📝 **300+** 面试题目
- 💻 **10+** 手撕代码实现
- 🏢 **11** 场字节跳动真实面经
- 📚 **9** 大主题模块
- 🔄 持续更新中...

---

## 🤝 贡献

欢迎提交 Issue 和 PR！如果觉得有帮助，请给个 ⭐ Star!

## 📄 License

[Apache License 2.0](LICENSE)
