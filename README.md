# Matsuri Hint / PT 建模实验（日服）

骏大祭模拟器只保存累计 Hint 等级 `H = total_hints`，不追踪单个技能的折扣。本项目比较如何用 `H`、剩余 `P = skill_pt` 和折扣状态估计可新增的技能评价分。2026-11-20：两套脚本的回归均已通过；目前只有合成实验，未校准真实日服数据，也未修改 Matsuri 策略。

## 文件与运行

- [`compare.cjs`](compare.cjs)：修正日服 Hint 折扣后的对照实验，包含选错动作的损失和外部求解标签导入。
- [`matsuri-hint-pt-experiment.cjs`](matsuri-hint-pt-experiment.cjs)：原始备份脚本，提供技能组预算前沿和旧公式。本身的旧合成器保留原样以供复现，其 Hint 4/5 折扣不用于新实验。
- [`matsuri-hint-pt-reproduce-2026-11-20.md`](matsuri-hint-pt-reproduce-2026-11-20.md)：原始实验、源码版本和脚本校验值。手机上的工作目录为 `Projects/matsuri-hint-pt-model-2026-11-20/`。

只需 Node.js，不需要安装依赖。旧脚本的测试用 100 个随机小例与穷举比对；新脚本覆盖折扣、同 H 反例、按整套卡组留出和求解标签导入。

```sh
node matsuri-hint-pt-experiment.cjs --test
node compare.cjs --test
node compare.cjs --synthetic
```

## 计分口径

- [模拟器](https://github.com/umaai-project/umaai-next/blob/ae3cab19bd6b8f2cbf9f9a3a4c49ced7bea6be94/crates/umasim/src/game/uma.rs#L195) 从 `H=21` 开始，把动作的 `hint_level` 加进 H。默认终局 PT 项是 `trunc(floor(P + 6.5*H) * 1.88 * 状态倍率)`，无折扣 / 小切 / 切者的倍率分别为 `1 / 1.04 / 1.1`。这不是游戏换算公式。[训练提示分支](https://github.com/umaai-project/umaai-matsuri/blob/a639a3c6f64e35e1dbdea490380c4a92839f755b/crates/matsuri-core/src/game/train.rs#L926) 有支援卡级上限与属性回退；[启发式](https://github.com/umaai-project/umaai-matsuri/blob/a639a3c6f64e35e1dbdea490380c4a92839f755b/crates/matsuri-core/src/value.rs#L831) 另有 `hint_level × weight`，换终局公式不自动改变它。
- [日服 Wiki 金弯示例](https://wiki.biligame.com/umamusume/弧線のプロフェッサー)列本体 180 PT、含下位 360 PT、评价 508。Hint 0–5 优惠为 0/10/20/30/35/40%；小切 4% 或切者 10% 与 Hint 在原价上相加，逐技能向下取整，上下位各算各的。技能评分取日服 master；以 URA 评分模型为例，距离和跑法分别取标签对应的最高适性，乘完各类修正再对单技能取整。教学里的性价比阈值是选技经验，不是最优评分标签。
- [SkillTipsResponseAnalyzer](https://github.com/URA-Plugins/SkillTipsResponseAnalyzer) 以最终评价为目标，处理技能前置、互斥、紫技解除和进化条件/名额，可用于生成参考标签，但需用真机购前购后数据校核。[SkillEffectPlugin](https://github.com/URA-Plugins/SkillEffectPlugin) 算的是比赛期望收益，不作为育成评价标签。两者均在 `URA-Plugins` 组织下，[EtherealAO 个人页](https://github.com/EtherealAO)置顶的是 URA Host。

## 合成结果

轮流留出一整套卡组，共 6 套、540 个终局快照。每个快照把一次 Hint 与 +4/+8/+12 PT 比较，Hint 赋 5/6 权重，剩余情况视为零技能收益。「平均损失」按全部 1,620 次比较计算，正确选择计零。两种代理动作均不含属性、候选解锁、进化名额或回合推进。

| 模型 | 技能分 MAE | Hint 增量 MAE | 每次比较平均损失 | 错选率 |
| --- | ---: | ---: | ---: | ---: |
| 旧公式 | 714.43 | 22.26 | 5.38 | 28.58% |
| 只看 PT | 546.46 | 19.40 | 9.16 | 30.86% |
| `P × rate(H, cut)` | 874.76 | 24.36 | 6.77 | 26.17% |
| `score(H,P,cut)` | 469.86 | 21.56 | 5.81 | 25.37% |
| `score` 向 PT-only 收缩 | 518.11 | 19.55 | 8.54 | 29.38% |

`rate` 按折扣状态对附近 H 样本的分数/PT 作加权平均；`score` 在相同预算 P 上对那些样本的最优技能分作加权平均。`H,P,cut` 不是充分信息：两状态同为 `H=5, P=110`，把 5 级折扣给 180 PT / 217 分技能可拿 217 分，给 100 PT / 129 分技能只拿 129 分。二维模型的合成终局误差最低，错选次数也更少，但错选造成的平均损失比旧公式高。它值得做真机校准，暂不替换训练策略。

## 日服回放验证

1. 固定游戏、Host 和 master 版本，记录终局购买前的候选、逐技能 Hint、适性、已学技能、可用进化和折扣状态。另从模拟器记 H，不用逐技能 Hint 之和冒充 H。测试按整套卡组留出；同一育成的衍生快照不跨训练折与测试折。
2. 用 Host 约束模型求 `S(P) = 最优技能分 - 已有技能分`，选取真机样例核对购前购后 PT 和评价。另求同预算下一次 Hint 后的分数，保留溢出、低价值技能和临界预算案例，不用 Wiki 基础分代替真机验证。
3. 运行 `node compare.cjs --solver labels.json`。每行 `{run, deck, H, P, cut, curve, after:{H,score}}`；`cut` 为 `none/small/full`，`curve[p]` 是预算上限为 p 时的最优新增技能分。各行都需覆盖 `0..max(P)+12`，`after.score` 与 `curve[P]` 使用同一已有技能基线。当前仅实现导入，Host 标签导出需另做，不上传原始回放或账号数据。
4. 用真实配对损失筛选参数，再分别替换终局分和启发式动作权重，以相同种子和未见卡组跑 Matsuri A/B。报告动作损失、终局真值差及按卡组的置信区间，不只比较终局 MAE。