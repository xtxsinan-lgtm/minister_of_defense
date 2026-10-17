# 15 存档与确定性

> 归属：存档格式与版本、`BattleEventLog`、RNG 实现（`Pcg32`、键派生、分布函数）、`DMath`、ID 分配器、状态哈希与校验和、输入日志与完整回放、确定性测试（见 00 §4.2 最后一行）。
> 依据：总纲 §9.3④、§11.4、§21-1（✅ 种子随存档走；读档后同样命令得同样结果）、§21-22（多人模式未定）；00 §2.2、§6（G-19、G-20、G-21 视为暂定采用）。
> 标记：✅ 总纲已确认；🟡 建议待确认（本文件编号 `D-xx`，汇总在第 10 节）。

---

## 1. 目标与范围

**解决的问题**
1. **同一台机器、同一版本**：读档后，同样的输入得到逐位相同的结果（✅ §21-1，硬需求）。不能靠反复读档刷结果。
2. **回放**：交界边战斗只存事件、不存帧（✅ §11.4）；开发用的“完整回放”只存初始条件 + 输入。
3. **跨机器**：同一版本在不同 CPU/操作系统上结果相同——**目标**，阶段 1 由 CI 检测、不保证；多人模式（阶段 2+）时变为硬需求（G-20）。
4. 存档格式可演进：版本号、迁移、静态数据增删后仍能读旧档。
5. 给所有规格统一提供：`Pcg32`、`Rng.For`、分布函数、`DMath`、ID 分配器、序列化注册、状态哈希。

**阶段 0 包含**：RNG 与分布、`DMath`、ID 分配器、规范化序列化与状态哈希、确定性测试框架（试验场批量对战的可复现性）、`Full` 片段的 `BattleEventLog`（试验场“班排沙盘”回放）。
**阶段 1 增加**：完整存档/读档、自动存档、版本迁移、静态 ID 重映射、输入日志与完整回放、跨平台 CI 比对。
**阶段 2+**：多人模式（锁步）、模组列表进入数据哈希、增量哈希。

---

## 2. 玩家能做什么、看到什么

### 2.1 决策清单
| 决策 | 说明 |
|---|---|
| 存档 / 读档 / 删除 | 任意时刻（模拟在两刻之间暂停后保存，见 §4.6） |
| 自动存档设置 | 间隔（默认每游戏日）、保留份数（默认 5） |
| 保留多少场战斗回放 | 默认最近 50 场（✅ §11.4 “最近 X 场”）；0 = 不保留（存档更小） |
| 单存档模式（可选） | 只允许一个存档槽，退出时自动保存（🟡 D-15）。注意：即使不开，读档也刷不出不同结果（✅ §21-1） |
| 导出 bug 报告包 | 存档 + 输入日志 + 校验和记录 + 版本信息（开发/测试用） |

### 2.2 反馈清单
| 反馈 | 内容 |
|---|---|
| 存档列表 | 剧本、国家、游戏日期、真实保存时间、游戏版本、缩略图 |
| 版本提示 | “存档来自旧版本 x.y，已自动升级”；“存档来自新版本，无法读取”；“AI 模型已更新，AI 决策可能与存档时不同”；“数据文件（装备/模板）已变化：N 个条目已重映射，M 个条目已删除” |
| 战斗回放列表 | 每场：边、双方、起止时间、结果、精度档（实时 = 可回放到班；缓存 = 只到连） |
| 去同步/确定性错误（调试/多人） | “第 1234 刻状态哈希不一致：分段 `Strip` 不同” |

---

## 3. 数据结构

> 命名空间 `MoD.Sim.Core`（RNG、DMath、ID）、`MoD.Sim.Persistence`（存档、日志、哈希）。

### 3.1 随机数

```csharp
public struct Pcg32 {                          // PCG-XSH-RR 64/32（O'Neill 2014），G-19
    private ulong state;
    private ulong inc;                         // 必须为奇数
    public Pcg32(ulong initState, ulong streamInc) {   // = 参考实现 pcg32_srandom_r 的语义，但直接给 inc
        state = 0; inc = streamInc | 1UL;
        NextUInt(); state += initState; NextUInt();
    }
    public uint NextUInt() {
        ulong old = state;
        state = unchecked(old * 6364136223846793005UL + inc);
        uint xorshifted = (uint)(((old >> 18) ^ old) >> 27);
        int rot = (int)(old >> 59);
        return (xorshifted >> rot) | (xorshifted << ((-rot) & 31));
    }
}

public enum RngDomain : uint {                 // 00 §6.2；只能追加
    None = 0, Org = 1, Personnel = 2, SquadSim = 3, Strip = 4, Exposure = 5,
    Logistics = 6, Damage = 7, Air = 8, Orders = 9, MapGen = 10, Strategic = 11,
    Ai = 12, Scenario = 13, Cache = 14
}

public static class Rng {
    public static ulong WorldSeed;             // 由 World 持有并在存档中保存；此处为访问器
    public static ulong Mix(ulong z);          // SplitMix64 finalizer，00 §6.2 原文
    public static Pcg32 For(RngDomain domain, ulong entityKey, long tick, uint salt);  // 00 §6.2 原文
    public static Pcg32 ForKey(RngDomain domain, ulong key, uint salt);               // 与世界时刻无关的流（缓存、编辑器）：= For(domain, key, 0, salt) 但 worldSeed 取 0
}
```

### 3.2 存档

```csharp
public enum SectionId : int {                  // 只能追加；写入顺序 = 数值升序
    Meta = 1, StaticIdTables = 2, WorldCore = 3, IdAllocators = 4,
    Countries = 10, Strategic = 11,            // 11
    Org = 20, Personnel = 21,                  // 01, 02
    SquadCombat = 30, Strip = 31,              // 03, 04
    Exposure = 40, Logistics = 41, Damage = 42, Air = 43,   // 05, 06, 07, 08
    TimeOrders = 50, Scheduler = 51,           // 09；Scheduler = 09 SimBudgetScheduler + 13 StarredSet
    Ai = 60, AiDerivedCache = 61,              // 12
    Scenario = 70,                             // 14
    InputLog = 90, ChecksumLog = 91,           // 15
    BattleLogs = 100, Notifications = 101,     // 15 / 09
    UiState = 110, Debug = 120                 // 13；调试（不进状态哈希）
}

public enum SectionFlags : int { None = 0, Required = 1, InStateHash = 2, Compressed = 4 }

public sealed class SaveHeader {               // 文件开头，未压缩
    public byte[] magic;                       // "MODSAVE\0"（8 字节）
    public uint formatVersion;                 // SaveFormatVersion
    public string gameVersion;                 // "0.3.1+abcdef0"
    public ulong dataHash;                     // 全部静态数据文件（排序后）内容的 XxHash64（含模组列表，阶段 2+）
    public ulong proxyModelHash;               // 12 的代理模型文件哈希
    public ulong worldSeed;
    public string scenarioId;                  // "nk_2010"
    public long simTimeMs;                     // 存档时的 SimTime
    public ulong stateHash;                    // 存档时的状态哈希（§4.10），读档后校验
    public int sectionCount;
    public List<SectionEntry> sections;
    public uint headerCrc32;                   // 以上字段的 CRC32
}

public sealed class SectionEntry {
    public SectionId id; public int sectionVersion; public SectionFlags flags;
    public long offset; public long compressedLength; public long rawLength;
    public ulong rawHash;                      // 未压缩内容的 XxHash64
}

public sealed class SaveMeta {                 // Meta 段：读档列表用，不解压其他段即可显示
    public string countryIso3; public string displayName; public long realTimeUnixMs;   // 真实时间只用于显示，绝不进模拟
    public byte[] thumbnailPng;                // 13 提供
    public List<string> modIds;                // 阶段 2+
}

public sealed class StaticIdTable {            // 每类静态数据一张：运行时句柄 → snake_case id
    public StaticKind kind;                    // Model / Template / Category / Specialty / Node / ...
    public List<string> idsByHandle;           // 下标 = 句柄值（00 §2.2：按 ordinal 排序编号）
}
public enum StaticKind : int { Category = 1, Model = 2, SquadTemplate = 3, UnitTemplate = 4, Specialty = 5, School = 6, Node = 7, Scenario = 8 }

public sealed class IdAllocatorState {         // 00 §2.2：每种运行时实体一个计数器
    public SortedDictionary<string, long> nextByType;   // 键 = 强类型 ID 名（"OrgUnitId"），值 = 下一个要分配的值（从 1 起）
}
```

### 3.3 序列化接口

```csharp
public interface ISectionSerializer {
    SectionId Id { get; }
    int Version { get; }                       // 当前写出的版本
    SectionFlags Flags { get; }
    void Write(World w, CanonicalWriter cw);   // 必须按规范顺序写（§4.4）
    void Read(World w, CanonicalReader cr, int version, LoadContext ctx);   // 旧版本由 Migrate 先升级
}

public sealed class CanonicalWriter {          // 规范化二进制写入器（§4.4 规则）
    public void U8(byte v); public void Bool(bool v);
    public void VarU(ulong v);                 // LEB128 无符号
    public void VarI(long v);                  // ZigZag + LEB128
    public void F64(double v);                 // −0.0 → +0.0；NaN/∞ → 抛异常
    public void Str(string s);                 // UTF-8，长度前缀 VarU
    public void Handle(StaticKind k, int handle);   // 写句柄值；读档时经 StaticIdTable 重映射
    public void Id<T>(T id) where T : IStrongId;    // 写 value（VarI）
}
public sealed class CanonicalReader { /* 对称 */ }

public sealed class LoadContext {
    public SortedDictionary<(StaticKind, int), int> handleRemap;   // 旧句柄 → 新句柄；−1 = 已删除
    public List<string> warnings;
}

public static class SaveRegistry {             // 各规格在启动时注册自己的段
    public static void Register(ISectionSerializer s);
    public static IReadOnlyList<ISectionSerializer> AllById();      // 按 SectionId 升序
}
```

### 3.4 输入日志与校验和

```csharp
public enum InputKind : int {                  // 只能追加
    None = 0, Order = 1,                       // 09 Order（Player 来源）
    StrategicAction = 2,                       // 11 IStrategicActions 的一次调用（方法枚举 + 参数；Quote 除外，见 §4.8）
    StarToggle = 3,                            // 13 星标（影响 09 调度）
    FidelityProfile = 4,                       // 09
    AiDifficulty = 5,                          // 12
    EventAnswer = 6, CeasefireAnswer = 7,      // 11（也可并入 StrategicAction，单列便于检查）
    DoctrineChange = 8,                        // 12 旅条令预设
    SettingWithSimEffect = 9,                  // 其他影响模拟的设置（白名单，§4.8）
    OrgEdit = 10,                              // 13 IUiCommands 的编制编辑（01 模板提交、绑定等）
    UnitAdmin = 11,                            // 13 IUiCommands 的单位管理（01/02/06/07/12：战备、分配策略、弹药构成、学校设置、合并/撤编、独立营保障旅等）
    CancelOrder = 12                           // 09 CancelOrder（Player 来源）；payload = orderId
}

public sealed class InputRecord {
    public long tick;                          // 输入在第 tick 刻开始之前生效（= 09 的 issuedAt.Tick）
    public int seq;                            // 同一 tick 内的顺序（提交顺序，从 0 起）
    public int playerSlot;                     // 单机 = 0
    public InputKind kind;
    public byte[] payload;                     // 该输入的规范化序列化
}

public sealed class ChecksumRecord {
    public long tick;
    public ulong stateHash;
    public ulong[] sectionHashes;              // 下标 = InStateHash 段在 AllById 中的序号
}
```

### 3.5 战斗事件记录 `BattleEventLog`

```csharp
public enum BattleEventKind : ushort {         // 只能追加
    None = 0,
    // 条带层（所有精度都记）
    BattleStarted = 1, BattleEnded = 2, ElementPlaced = 3, ElementMoved = 4, ElementRemoved = 5,
    ContactLineUpdate = 6, LineProgress = 7,          // BreachProgress / PenetrationProgress / 各线汇总
    FireMission = 8, Impact = 9, StripLoss = 10,       // 条带上的间瞄/纵深打击及其损失汇总
    EngagementStarted = 11, EngagementEnded = 12,
    ConvoyMoved = 13, Directive = 14,                  // 06 车队；12 条令指令（含原因码）
    PeriodBoundary = 15,                               // 24h 阶段边界（✅ §11.3 可单独回放）
    // 班级（只记 Full 精度片段）
    SquadSnapshot = 32, SquadMoved = 33, Detection = 34, Shot = 35, Hit = 36,
    Casualty = 37, VehicleDamage = 38, Suppression = 39, Dismount = 40, FireRequest = 41
}

public sealed class BattleEventRecord {
    public long timeMs;                        // 绝对 SimTime（编码时按差分）
    public BattleEventKind kind;
    public int subjectId, objectId;            // 依 kind 解释（元素/班/片段 ID 的 value）
    public int[] ints; public double[] reals;  // 依 kind 的固定布局（§4.9 表）
}

public sealed class BattleLog {
    public EdgeBattleId battle; public EdgeId edge;
    public long startMs, endMs;                // endMs = −1 表示进行中
    public FidelitySummary fidelity;           // 各片段的精度统计（是否可回放到班）
    public List<BattleLogSegment> segments;    // 每 24h 一段
}
public sealed class BattleLogSegment { public long startMs, endMs; public byte[] encoded; public int eventCount; }
```

---

## 4. 算法与公式

### 4.1 RNG 实现

#### 4.1.1 种子派生
- 00 §6.2 的 `Mix`、`For` 原文照抄；本文件给出 `Pcg32` 构造函数的确切语义（§3.1）：`For` 中 `new Pcg32(state: s, inc: inc)` 即 `new Pcg32(initState: s, streamInc: inc)`。
- `worldSeed`：新游戏时由玩家输入（可选）或系统给出。系统给出的方式：`worldSeed = Mix(剧本 id 的 XxHash64 ^ 新游戏界面打开时的真实时间毫秒)`——**这是唯一允许读真实时间的地方**，且只在世界创建前一次，之后随存档走。
- `ForKey`（与世界无关的流）：用于 03 `OutcomeCache` 生成、能力衰减曲线等“同样的键必须在任何存档中得到同样结果”的场合（03 原文写作 `For(Cache, key, 0, salt)`，其 worldSeed 视为 0）。🟡 D-11

#### 4.1.2 抽取函数（全项目唯一实现；其他规格只调用）
```csharp
public static class PcgExt {
    public static double NextDouble(ref this Pcg32 r) {           // [0,1)，53 位，00 §6.2 原文
        ulong a = r.NextUInt() >> 5, b = r.NextUInt() >> 6;
        return (a * 67108864.0 + b) / 9007199254740992.0;
    }
    public static bool Bernoulli(ref this Pcg32 r, double p) => r.NextDouble() < p;   // p ≤ 0 恒 false；p ≥ 1 恒 true（仍消耗 2 次）
    public static uint NextInt(ref this Pcg32 r, uint n) {          // [0,n)，Lemire 无偏；n == 0 抛异常
        ulong m = (ulong)r.NextUInt() * n; uint l = (uint)m;
        if (l < n) { uint t = (0u - n) % n; while (l < t) { m = (ulong)r.NextUInt() * n; l = (uint)m; } }
        return (uint)(m >> 32);
    }
    public static double NextGaussian(ref this Pcg32 r) {           // 标准正态；固定消耗 4 次 NextUInt（两次 NextDouble）
        double u1 = 1.0 - r.NextDouble();                           // (0,1]
        double u2 = r.NextDouble();
        return Math.Sqrt(-2.0 * DMath.Log(u1)) * DMath.Cos(2.0 * Math.PI * u2);   // Box–Muller，丢弃 sin 分支
    }
    public static double Normal(ref this Pcg32 r, double mean, double sd) => mean + sd * r.NextGaussian();
    public static double Exponential(ref this Pcg32 r, double rate) => -DMath.Log(1.0 - r.NextDouble()) / rate;
    public static int Poisson(ref this Pcg32 r, double lambda) {    // 🟡 D-08
        if (lambda <= 0) return 0;
        if (lambda < 30) {                                          // Knuth 乘法法
            double L = DMath.Exp(-lambda), p = 1.0; int k = 0;
            do { k++; p *= r.NextDouble(); } while (p > L);
            return k - 1;
        }
        double x = Math.Floor(lambda + Math.Sqrt(lambda) * r.NextGaussian() + 0.5);   // 正态近似
        return x < 0 ? 0 : (int)x;
    }
    public static int Binomial(ref this Pcg32 r, int n, double p) { // 🟡 D-08
        if (n <= 0 || p <= 0) return 0; if (p >= 1) return n;
        if (n <= 64) { int c = 0; for (int i = 0; i < n; i++) if (r.NextDouble() < p) c++; return c; }
        double x = Math.Floor(n * p + Math.Sqrt(n * p * (1 - p)) * r.NextGaussian() + 0.5);
        return (int)Math.Clamp(x, 0, n);
    }
    public static int WeightedChoice(ref this Pcg32 r, ReadOnlySpan<double> w) {   // 调用方保证 w 的顺序确定（通常按 ID 升序）
        double total = 0; for (int i = 0; i < w.Length; i++) total += Math.Max(0, w[i]);   // 串行求和
        if (total <= 0) return -1;                                  // 不消耗随机数
        double x = r.NextDouble() * total, cum = 0;
        for (int i = 0; i < w.Length; i++) { cum += Math.Max(0, w[i]); if (x < cum) return i; }
        for (int i = w.Length - 1; i >= 0; i--) if (w[i] > 0) return i;   // 舍入保护：返回最后一个正权重
        return -1;
    }
    public static void Shuffle<T>(ref this Pcg32 r, IList<T> list) {   // Fisher–Yates，从尾到头
        for (int i = list.Count - 1; i > 0; i--) { int j = (int)r.NextInt((uint)(i + 1)); (list[i], list[j]) = (list[j], list[i]); }
    }
}
```
- 05 中写的 `rng.Normal(0, 1)` 即 `Normal`；03 的 `NextGaussian()` 即本函数。
- 规则：同一个派生流内抽取次数与顺序必须确定（00 §6.2）；本节每个函数的消耗次数要么固定、要么只依赖抽到的值（Knuth/拒绝采样），都是确定的。

### 4.2 `DMath`（确定性超越函数）🟡 D-07

**方法**：把 fdlibm 5.3（Sun，自由许可）的双精度实现**逐行移植为纯 C#**。只用 `+ − × ÷`、`Math.Sqrt`、`Math.Abs`、`Math.Floor`、整数运算与 `BitConverter.DoubleToInt64Bits / Int64BitsToDouble`。不调用 `System.Math` 的超越函数。

| 函数 | fdlibm 源 | 定义域与特殊值 |
|---|---|---|
| `Sin`、`Cos`、`Tan` | `s_sin.c`、`s_cos.c`、`s_tan.c`、`k_sin.c`、`k_cos.c`、`k_tan.c`、`e_rem_pio2.c` | 只移植中等参数的 Cody–Waite 三段约简（\|x\| ≤ 2^19·π/2）；更大参数**断言失败**（模拟中不应出现）。不移植 `k_rem_pio2.c` |
| `Atan`、`Atan2` | `s_atan.c`、`e_atan2.c` | 完整 |
| `Asin`、`Acos` | `e_asin.c`、`e_acos.c` | \|x\| > 1 → NaN → 调用方断言 |
| `Exp` | `e_exp.c` | x > 709.78 → +∞（断言）；x < −745.13 → 0 |
| `Log`、`Log10` | `e_log.c`、`e_log10.c` | x ≤ 0 → 断言 |
| `Pow` | `e_pow.c` | 完整（含整数指数快路径） |
| `Tanh`（可选） | `s_tanh.c` | 依赖 `Expm1`（`s_expm1.c`）一并移植 |

- 精度：fdlibm 误差 < 1 ulp；**更重要的是逐位确定**（同一段 C# 在任何 IEEE-754 机器上结果相同）。
- 允许直接用 `System.Math` 的：`Sqrt, Abs, Min, Max, Floor, Ceiling, Truncate, Clamp, Sign, CopySign`（都是精确运算）。`Math.Round` 必须显式 `MidpointRounding`（00 §6.3）。
- 常量 `Math.PI`、`Math.E` 可用（编译期常量）。

### 4.3 ID 分配器
```csharp
public sealed class IdAllocator {
    private readonly SortedDictionary<string, long> next = new(StringComparer.Ordinal);
    public long Next(string typeName) {        // 由各强类型的工厂方法调用：OrgUnitId.New(alloc) 等
        next.TryGetValue(typeName, out var v); if (v == 0) v = 1;
        next[typeName] = v + 1; return v;      // 0 = 空，永不分配；永不复用（00 §2.2）
    }
}
```
- 实体创建只在规定阶段按确定顺序进行（00 §6.4-6），所以分配结果确定。
- 并行阶段不得分配 ID：需要新实体时先缓冲请求，阶段末按（请求者 ID，序号）升序串行创建（00 §5.2 同步规则 6）。
- 溢出：`int` 型 ID 超过 2^31−1 → 断言（阶段 1 远达不到；`PersonnelId` 若接近，改为 `long`，🟡 D-16）。

### 4.4 规范化序列化（存档与状态哈希共用）
规则（`CanonicalWriter` 强制执行）：
1. 小端；整数用 LEB128（有符号先 ZigZag）；`double` 写 8 字节 IEEE 位模式；`−0.0` 规范为 `+0.0`；NaN/∞ → 抛 `NonFiniteInSimStateException`（暴露 bug，🟡 D-13）。
2. 字符串 UTF-8、长度前缀；不做 Unicode 规范化（模拟中的字符串只有 ASCII snake_case id）。
3. **集合**：先写元素个数；`List` 按其语义顺序（规格已规定为确定顺序）；`Dictionary/HashSet` **禁止直接写**，必须先按键排序（数值键升序；字符串键 `StringComparer.Ordinal`）；`SortedDictionary` 直接按其顺序。
4. **组件**：按实体 ID 升序写；一个段内多种组件按段内固定顺序（各规格在自己的序列化器里写死）。
5. 可选字段：先写 `Bool hasValue`。
6. 引用静态数据：写句柄（`Handle`），段 `StaticIdTables` 提供句柄 → 字符串 id 的表。
7. **不写**：缓存的可重算量**只有在**“重算结果与不中断运行完全一致”时才可不写（例：每步开头整体重算、不跨刻存在的量，如 05 的 `TileCounterReconState`）。凡是“周期性重建、两次重建之间被读取”的派生量（例：12 的影响力图、情报画面）**必须写**（🟡 D-17，与 12 I-15 一致）。
8. 各规格的“存档清单”以其第 6 节“与 15 的接口”为准；本文件不重复列字段。

### 4.5 文件布局
```text
[SaveHeader（未压缩，长度前缀 VarU）]
[段 1 数据][段 2 数据]...           // 顺序 = SectionId 升序；每段独立压缩（flags 含 Compressed 时）
```
- 压缩：.NET 内置 `BrotliEncoder`，质量 `SaveCompressionQuality`（5），窗口 22（🟡 D-01）。压缩后的字节**不要求**确定（不参与哈希）；`rawHash` 用未压缩内容。
- 文件扩展名 `.modsave`；位置由 `MoD.Game` 决定（Godot `user://saves/`）。

### 4.6 存档流程
```csharp
byte[][] SnapshotSections(World w) {           // 在模拟线程上、两刻之间同步执行（模拟暂停）
    var list = new List<byte[]>();
    foreach (var s in SaveRegistry.AllById()) { var cw = new CanonicalWriter(); s.Write(w, cw); list.Add(cw.ToArray()); }
    return list;                               // 之后模拟可以继续
}
void WriteFile(string path, SaveHeader h, byte[][] raws) {   // 可在后台线程做（只处理已拷贝的字节）
    // 1. 计算每段 rawHash、压缩；2. 填 header（stateHash = §4.10 用同一批 raw 计算）；
    // 3. 写到 path + ".tmp"；Flush(true)（落盘）；4. 原子替换：File.Move(tmp, path, overwrite: true)
}
```
- **只能在两刻之间存档**（09 §4.1 规则 1）：玩家点“保存”→ 当前刻结束后暂停（`PauseReasons.Modal`）→ 快照 → 恢复。
- 自动存档：在 `(n+1) % AutosaveIntervalMin == 0` 的刻**结束后**（即世界时刻为整日 00:00 时）触发，槽位轮换 `autosave_0..K−1`。另在“战争开始”“停火”事件所在刻结束后各存一份 `autosave_event`（覆盖式）。
- 存档时追加一条 `ChecksumRecord`（即使未开启每小时校验），供读档后自检。

### 4.7 读档流程与版本
```csharp
World Load(Stream s) {
    var h = ReadHeader(s);                     // 校验 magic、headerCrc32
    if (h.formatVersion > SaveFormatVersion) throw new SaveTooNewException();
    var ctx = new LoadContext();
    // 1. 静态数据重映射：读 StaticIdTables 段，按字符串 id 映射到当前加载的数据句柄
    //    当前数据中找不到的 id：若当前数据有 deprecated 条目且其 replaced_by 指向某 id → 映射过去；否则 → −1（已删除），记警告
    // 2. 其余段按 SectionId 升序：校验 rawHash；若 sectionVersion < 当前 Version → 依次调用 Migrate_vK_to_vK+1
    //    未知段：flags 无 Required → 跳过并警告；有 Required → 失败
    // 3. 各段 Read(w, cr, version, ctx)：遇到句柄经 ctx.handleRemap 转换；被删除的静态引用由各规格定义回退（例：装备型号被删 → 01 的替代规则）
    // 4. 若 dataHash、proxyModelHash 与当前相同且无迁移：重算 stateHash 必须等于 h.stateHash，否则报“存档损坏或非确定”（调试版断言）
    // 5. clock.pauseReasons = Player
}
```
**兼容策略**（🟡 D-12）
| 情况 | 行为 |
|---|---|
| 同版本、同数据 | 逐位恢复，继续运行与不中断运行逐位相同（硬需求） |
| 旧格式版本 | 迁移后可读；不保证与旧版本继续运行的结果相同 |
| 数据文件变化（`dataHash` 不同） | 可读，按字符串 id 重映射；提示变化条目数 |
| 代理模型变化 | 可读；提示 AI 决策可能不同 |
| 新于当前版本 | 拒绝 |
| 完整回放（输入日志） | **只在 gameVersion、dataHash、proxyModelHash 完全相同时可用**；否则界面隐藏回放入口 |

### 4.8 输入日志 `InputLog` 与完整回放
**什么算输入**：改变模拟结果的一切玩家行为（白名单）：
- 09 `SubmitOrder`（Player 来源）、`CancelOrder`（`InputKind.CancelOrder`）；11 `IStrategicActions` 的每次调用（`Quote` 除外：纯查询，不改状态；`AnswerEvent`/`AnswerCeasefire` 记为 `EventAnswer`/`CeasefireAnswer`，其余记 `StrategicAction`，payload 首字段 = 方法编号，按 11 §6.3 接口中的声明顺序从 1 起编、只能追加，其后为参数的规范化序列化）；13 `IUiCommands` 的编制编辑（`OrgEdit`）与单位管理（`UnitAdmin`）；事件与停火答复；星标增删；`FidelityProfile`；AI 难度；旅条令预设切换；其他列入 `SettingWithSimEffect` 白名单的设置（新增需要在本文件登记）。
**不是输入**：暂停、速度、镜头、界面过滤器、自动暂停设置、打开哪个视图、存档/读档本身。

**记录**：每条输入提交时 `tick = clock.currentTick`（即将执行的刻），`seq` = 本刻内提交序号。AI 命令**不记录**（回放时由 AI 重新产生）。

**回放**：
```text
起点 = 新游戏（scenarioId + worldSeed + 新游戏选项 → 14 的确定性初始化）或某个存档（关键帧）
for n = 起点刻 … 终点刻:
    把 InputLog 中 tick == n 的记录按 seq 升序重新提交（与实时时相同的接口）
    RunTick(n)
    若 n % 60 == 0 且该刻有 ChecksumRecord：比对 stateHash，不同 → 报告第一个不同的段
```
- 存档里保存**从游戏开始以来的全部输入**（`InputLog` 段），以及开局参数（`Scenario` 段），所以任何存档都能从头重放到当前（开发/bug 报告；大小见 §5）。
- 14 的剧本初始化必须是 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数（14 的接口需求）。

### 4.9 战斗事件记录 `BattleEventLog`
**写入**：04（条带层）与 03（班级，只在 `Full` 片段）在各自阶段调用 `BattleLogWriter.Append(battleId, record)`；记录先进本刻缓冲，`Reporting`（阶段 150）按 `(timeMs, kind, subjectId, objectId, 缓冲序号)` 升序编码进当前段。

**编码**（每段）：
```text
每条：VarU(Δt_ms 相对上一条) · VarU(kind) · VarI(subjectId − 上一条同 kind 的 subjectId) · VarI(objectId) ·
      ints（VarI，个数由 kind 固定）· reals（按 kind 的量化规则转成整数后 VarI）
量化：位置 → 10 m（x、y 各一个 VarI）；比例量（压制、进度、疲劳）→ 1/1000；角度不记录
```
| kind | subject | object | ints | reals（量化） |
|---|---|---|---|---|
| `ElementPlaced` / `ElementMoved` | 条带元素 ID | 连/营 OrgUnitId | [echelonRole] | [x, y] |
| `ContactLineUpdate` | 0 | 0 | [点数] | 折线顶点 x0,y0,x1,y1…（变化 > 50 m 才记） |
| `LineProgress` | `BattleLine` 值 | 0 | [] | [进度] |
| `FireMission` | 炮兵连 ID | 目标元素 ID（或 0 = 点） | [弹药句柄, 发数] | [目标 x, y] |
| `Impact` | 炮兵连 ID | 目标元素 ID | [伤亡数, 车辆损毁数] | [x, y] |
| `EngagementStarted/Ended` | EngagementId | 我方连 | [敌方连, 精度档, 结局] | [x0] |
| `Directive` | 主体 ID | 伙伴 ID | [DirectiveKind, reason 句柄] | reasonNumbers |
| `SquadSnapshot` | SquadId | EngagementId | [人数, 车辆数, mountState] | [x, y] |
| `Shot` | 射手元素 | 目标元素 | [武器句柄, 弹药句柄] | [] |
| `Hit` / `Casualty` / `VehicleDamage` | 目标 | 射手 | [结果枚举] | [] |

- **条带层事件对所有精度档都记录**（✅ §11.4：缓存片段的战斗也能在连级回放）；班级事件只在 `Full` 片段记录。
- **保留**：进行中的战斗 + 最近 `BattleLogRetention`（50）场已结束战斗（按结束时刻；平局按 `EdgeBattleId`）。超出的整场删除。持续战斗按 24h 分段，阶段战报可单独回放（✅ §11.3）。
- `BattleLogs` 段**不进状态哈希**（它是输出，不影响模拟）；但它的内容是确定的，测试 H8 会比对其哈希。

### 4.10 状态哈希
```text
对每个 flags 含 InStateHash 的段（按 SectionId 升序）：
   h_i = XxHash64(raw_i, seed = 0)
stateHash = XxHash64( 拼接( VarU(SectionId_i) · u64LE(h_i) ) , seed = 0 )
```
- `InStateHash` 段：除 `Meta`、`InputLog`、`ChecksumLog`、`BattleLogs`、`Notifications`、`UiState`、`Debug` 外的所有段（`AiDerivedCache` 包含在内，因为它影响决策）。
- 实现：`System.IO.Hashing.XxHash64`（NuGet，纯托管实现，跨平台确定）。🟡 D-02
- `Checksum` 阶段（160）：调试构建或多人模式下每 `ChecksumIntervalMin`（60）刻计算，追加 `ChecksumRecord`（保留最近 `ChecksumKeep` 条，存入 `ChecksumLog` 段）。
- 性能：哈希 = 全量规范化序列化 + XxHash64；纳卡规模估计 5–20 MB 原始数据 → 约 20–60 ms，每游戏小时一次可接受（V6 验证）。阶段 2+ 可改为“脏段增量”。

### 4.11 确定性测试框架（CI）
| 编号 | 测试 | 做法 | 通过标准 |
|---|---|---|---|
| H1 | 黄金回放 | 固定剧本（试验场标准对战 ×3；`nk_2020` 前 72 小时 ×1）+ 固定输入脚本，跑 N 刻，输出每小时 `stateHash` | 与仓库中 `tests/golden/*.hashes` 完全一致。规则变化导致不一致时，开发者必须在同一提交中**有意**更新黄金文件并写明原因 |
| H2 | 存读档往返 | 在随机刻（含小时中间、片段进行中、命令待生效中）存档 → 读档 → 继续到 T_end | `stateHash(T_end)` 与不中断运行相同；且“读档后立即重算的 stateHash = 存档头里的” |
| H3 | 并行无关性 | 同一 H1 场景用 1 线程与 N 线程；调试开关 `PermuteParallelOrder`：并行阶段内实体执行顺序按测试种子打乱 | 哈希全部相同（验证 00 §5.2 同步规则 6） |
| H4 | 跨平台 | CI 矩阵 win-x64、linux-x64、osx-arm64、linux-arm64 跑 H1 | 阶段 1：不一致只告警并生成差异报告（🟡 D-09）；多人模式前：必须全部一致 |
| H5 | 禁用 API 静态检查 | `Microsoft.CodeAnalysis.BannedApiAnalyzers` + `BannedSymbols.txt`（§5.3）作用于 `MoD.Sim.*`；另加自定义分析器：`MoD.Sim` 中出现 `float`/`System.Single`、对 `Dictionary<,>`/`HashSet<>` 的 `foreach`（未经排序）报错 | 0 违规 |
| H6 | DMath | 与 Python `mpmath`（100 位精度）在每个函数 10^6 个随机点上比较 | 误差 ≤ 1 ulp；且 H4 平台之间逐位一致 |
| H7 | RNG 向量 | §8 T1–T5 的固定向量；`tools/determinism/pcg_ref.py` 与 C# 输出逐一比对 | 完全一致 |
| H8 | 输入日志回放 | 自动化测试用脚本“玩家”玩 7 个游戏日（下命令、改设置、标星），记录 InputLog 与 ChecksumLog；从头回放 | 每个检查点哈希一致；`BattleLogs` 段哈希一致 |
| H9 | 缓存独立性 | 03 `OutcomeCache`：按不同顺序/线程/是否预热生成同一批键 | 内容逐位一致；使用缓存的模拟哈希不受预热影响 |
| H10 | 调试开关无关性 | AI trace 开/关（12 T9）、事件日志保留数 0/50、可视化开/关 | 状态哈希不变 |

### 4.12 跨机器浮点策略（G-20 的落实）
1. **工具链锁定**：.NET 8 LTS（具体补丁版本写入 `global.json`）；`<Deterministic>true</Deterministic>`；发布版与 CI 用同一 SDK。升级 .NET 版本视为“规则变化”，需重跑 H1/H4 并可能更新黄金文件。
2. **只用 IEEE 精确运算**：`+ − × ÷`、`Math.Sqrt`；超越函数一律 `DMath`。RyuJIT 在 x64（SSE2/AVX）和 ARM64 上对 `double` 标量运算不做 x87 扩展精度、不自动合并 FMA——这是本方案的前提，**由 H4 持续验证**而不是假设。
3. **禁止**：`float`、`MathF`、`Math.FusedMultiplyAdd`、`System.Numerics.Vector*`、`System.Runtime.Intrinsics`、`Parallel.For` 的归约、`decimal` 与 `double` 混算后再参与比较（货币若改 `decimal` 需整体替换）。
4. **数据加载**：`double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture)`（.NET Core 3.0+ 符合 IEEE 正确舍入）；单位换算在加载时一次完成（如 km × 1000），保证所有机器得到同一 double。
5. **Godot 边界**：模拟 → 画面只单向传快照，`double → float` 转换只在 `MoD.Game`；画面层的任何结果不回流模拟。
6. **H4 失败时的处理顺序**：定位到第一个不同的段 → 对该段做逐实体比对 → 找到产生差异的运算 → 换成 `DMath` 或重写为精确运算；若仍无法消除（例如编译器优化行为差异），在该子系统局部改用 Q32.32 定点（🟡 D-09 备选）。

### 4.13 缓存与派生数据
| 数据 | 是否影响模拟 | 处理 |
|---|---|---|
| 03 `OutcomeCache` | 是 | 内容是键的纯函数（`ForKey`，与世界时刻无关），未命中同步生成（03 §4.14.2）→ **不存档、不进哈希**；可选磁盘缓存 `user://cache/outcome_<dataVersion>.bin` 只为提速 |
| 12 影响力图、情报画面 | 是 | 周期重建 → **存档**（`AiDerivedCache`）、进哈希 |
| 05 `TileCounterReconState` | 是 | 每步开头整体重算、不跨刻 → 不存档 |
| 05/04/08 的跨刻缓冲（`ReconDwellSample` 等） | 是 | 跨刻存在 → 存档（05 §6.2 已列） |
| 10 `MapState`（当前生效的道路/铁路变体、`topologyVersion`） | 是 | 是 (SimTime 日, 09 `TileControl`) 的纯函数 → 读档时重算，不存档；`topologyVersion` 不存档（10 §3.8） |
| 06 `SupplyGraph`、`AmmoBasis` | 是 | 读档后重建（06 §4.2.1），不存档 |
| 13 视图模型 | 否 | 不存档 |
| 12 `AiDecisionTrace` | 否 | 不进哈希；可写入 `Debug` 段 |

### 4.14 多人模式考虑 [阶段 2+] 🟡 D-10
- **锁步（lockstep）**：所有客户端运行同一模拟，只交换输入（§4.8 同一套 `InputRecord`）。输入的生效刻 = 提交时的 `currentTick + InputDelayTicks`；每刻开始前必须收齐所有玩家该刻的输入（或“空输入”心跳）。
- 速度：取所有玩家请求速度的最小值；任一玩家暂停 → 全体暂停（或投票，交给 13）。
- 校验：每 `MpChecksumIntervalMin`（10）刻交换 `stateHash`；不一致 → 冻结，交换 `sectionHashes` 定位，导出双方状态差异，主机发送存档重新同步。
- 中途加入/断线重连：主机在两刻之间发送存档（§4.6）+ 之后的输入。
- 前提：H4 跨平台测试必须通过；`SimBudgetScheduler` 已只依赖模拟输入（09 T-12）；`FidelityProfile` 等影响模拟的设置由主机统一决定。
- 备选：服务器权威 + 状态流（不需要跨机器确定性，但带宽大；对营/班级的状态量不现实）。

---

## 5. 常数表

### 5.1 存档与日志

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `SaveFormatVersion` | 1 | — | 递增 | — |
| `SaveCompressionQuality` | 5 | Brotli 级别 | 1–11 | 速度/体积折中 |
| `AutosaveIntervalMin` | 1 440 | 游戏 min | 360–10 080 | 每游戏日 |
| `AutosaveKeep` | 5 | 份 | 1–20 | |
| `BattleLogRetention` | 50 | 场 | 0–500 | ✅ §11.4“最近 X 场”；🟡 D-05 |
| `BattleLogPosQuantM` | 10 | m | 5–50 | 条带分辨率“几百米”，10 m 足够画面 |
| `BattleLogFracQuant` | 0.001 | — | — | |
| `ContactLineMinChangeM` | 50 | m | 10–200 | |
| `ChecksumIntervalMin` | 60 | 游戏 min | 10–1 440 | 00 §5.2 阶段 160 |
| `ChecksumKeep` | 168 | 条 | 24–720 | 7 个游戏日 |
| `MaxSaveBytesWarn` | 200 000 000 | B | — | 超过时提示减少回放保留 |

**体积估算（纳卡，confidence: estimated）**：人员 ~7–10 万条 × ~16 B ≈ 1.5 MB；装备 ~1 万件 × ~24 B；条带/片段状态 < 1 MB；其他 < 2 MB → 原始 ~5 MB，压缩后 ~1–2 MB。回放：一场持续 24h 的大型战斗条带层 ~2–5 万条事件 × ~8 B ≈ 0.4 MB；含 `Full` 班级事件 ×5–10。50 场 → 20–100 MB（未压缩），压缩后约 1/3。输入日志：每游戏日 ~50–300 条 × ~60 B，十年剧本 ≤ 10 MB。

### 5.2 多人（阶段 2+）

| 名称 | 初始值 | 单位 | 调参范围 | 来源/理由 |
|---|---|---|---|---|
| `InputDelayTicks` | 2 | 刻 | 1–10 | 估算；实际值由网络延迟与速度档共同决定（Speed5 下 1 刻 ≈ 4 ms 真实时间，需要更大的延迟刻数），阶段 2 定 |
| `MpChecksumIntervalMin` | 10 | 游戏 min | 1–60 | 尽早发现去同步 |

### 5.3 禁用符号清单（`BannedSymbols.txt`，作用于 `MoD.Sim.*`）
```text
T:System.Random;使用 Rng.For（15 §4.1）
P:System.Random.Shared
M:System.Math.Sin(System.Double)   M:System.Math.Cos(System.Double)   M:System.Math.Tan(System.Double)
M:System.Math.Asin(System.Double)  M:System.Math.Acos(System.Double)  M:System.Math.Atan(System.Double)
M:System.Math.Atan2(System.Double,System.Double)   M:System.Math.Exp(System.Double)
M:System.Math.Log(System.Double)   M:System.Math.Log10(System.Double) M:System.Math.Pow(System.Double,System.Double)
M:System.Math.FusedMultiplyAdd(System.Double,System.Double,System.Double)
M:System.Math.Round(System.Double)   // 必须带 MidpointRounding
T:System.MathF
P:System.DateTime.Now  P:System.DateTime.UtcNow  P:System.DateTimeOffset.Now  T:System.Diagnostics.Stopwatch
M:System.Guid.NewGuid
M:System.String.GetHashCode   T:System.HashCode
N:System.Numerics   N:System.Runtime.Intrinsics
M:System.Threading.Tasks.Parallel.For`1(...)   // 带 localInit/localFinally 的归约重载
P:System.Environment.TickCount   P:System.Environment.ProcessorCount
```
（每行一个符号；上面为节省篇幅把多个写在一行，实际文件中拆开。）

### 5.4 RNG salt
本文件自身不抽随机数，无 salt 表。

---

## 6. 与其他系统的接口

### 6.1 本文件提供
| 接口 | 使用者 | 说明 |
|---|---|---|
| `Pcg32`、`Rng.For`、`Rng.ForKey`、`PcgExt.*` | 全部 | §4.1 |
| `DMath.*` | 全部 | §4.2 |
| `IdAllocator` | 全部（经各强类型工厂） | §4.3 |
| `SaveRegistry.Register(ISectionSerializer)` | 每个持有状态的规格 | 启动时注册；`SectionId` 见 §3.2（新规格新增段：追加枚举值） |
| `CanonicalWriter/Reader` | 同上 | §4.4 |
| `Save(World, Stream)`、`Load(Stream) → World`、`ReadMeta(Stream)` | 13（菜单）、`MoD.Game` | §4.6–§4.7 |
| `InputLog.Append(InputKind, payload)` | 09（玩家命令、取消命令）、11（玩家战略动作）、13（星标、设置、编制编辑、单位管理）、12（难度、条令预设） | §4.8 |
| `BattleLogWriter.Begin/Append/End(EdgeBattleId, …)` | 04、03 | §4.9 |
| `BattleLogReader` | 13（回放视图） | 解码段，按时刻迭代事件 |
| `StateHash.Compute(World)`、`Checksum.Step(World, long n)` | 09（阶段 160）、测试 | §4.10 |
| `ulong XxHash64(ReadOnlySpan<byte>)` | 01（编成签名可选）、12（模型哈希）、14 | 封装 `System.IO.Hashing` |

### 6.2 本文件需要
| 来源 | 需要 | 说明 |
|---|---|---|
| 各规格（01–14） | 各自的 `ISectionSerializer` 实现与“存档清单” | 存哪些状态由各规格第 6 节声明 |
| 09 | 刻边界钩子（存档只在两刻之间）、阶段 150/160 的调用、`PauseReasons.Modal` | |
| 14 | 剧本初始化是 `(scenarioId, worldSeed, options, dataHash)` 的确定性函数 | 完整回放的起点 |
| 12 | 代理模型文件哈希 | 写入头 |
| 13 | 缩略图、存档菜单、回放视图、bug 报告导出 | |
| `MoD.Data` | 静态数据加载后的句柄表与 `dataHash`；`deprecated`/`replaced_by` 字段（data/README 约定的扩展） | 重映射 |

---

## 7. 边界情况

| 情况 | 处理 |
|---|---|
| 存档时磁盘写满/进程崩溃 | 先写 `.tmp` 再原子替换，旧存档不受影响；失败时提示并保留 `.tmp` 供诊断 |
| 某段 `rawHash` 校验失败 | Required 段 → 读档失败（“存档损坏”）；非 Required（回放、通知、UI）→ 丢弃该段并警告 |
| 静态 id 在新数据中被删除且无 `replaced_by` | 句柄映射为 −1；各规格读取时按自己的回退规则处理（01：型号缺失 → 走替代规则；模板缺失 → 营标记为“无模板”，保留实际名册）；全部列入警告 |
| 状态中出现 NaN/∞/−0 | 写入时 −0 规范化；NaN/∞ 抛异常 → 调试版中断，发布版存档失败并提示（不写坏档） |
| 存档发生在 `Engagement` 进行中 | 允许：03 的片段状态、步内事件队列（跨刻的部分）全部序列化；H2 覆盖此情形 |
| 小时中间存档 | 允许；派生缓存规则见 §4.4-7 |
| 输入日志里的命令指向已不存在的实体 | 回放时与实时一样走 09 的校验 → `Failed`；结果仍一致 |
| 回放时版本不匹配 | 回放入口隐藏；强行回放（开发选项）时在第一处哈希不一致处停止并报告 |
| `WeightedChoice` 全零权重 | 返回 −1，不消耗随机数（调用方必须处理） |
| `NextInt(0)` | 抛异常（调用方 bug） |
| `Poisson` λ 很大（> 1e6） | 正态近似；结果夹到 `int` 范围 |
| `DMath.Sin` 参数超出 2^19·π/2 | 断言（模拟中角度应先规约到 [−π, π]） |
| 跨年、闰年的 `SimTime` | `long` 毫秒无上限问题（2^63 ms ≈ 2.9 亿年） |
| 两个规格注册了同一 `SectionId` | 启动时断言 |
| 战斗回放保留数被玩家调小 | 下次 `Reporting` 时删除超出部分（不影响模拟） |

---

## 8. 测试用例

**T1 PCG32 参考向量**（与 pcg-random.org 的 `pcg32-demo` 一致，Python 已验算）
`new Pcg32(initState: 42, streamInc: (54 << 1) | 1)`，连续 6 次 `NextUInt()`：
`0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e`。

**T2 SplitMix64**
`Mix(0) = 0xe220a8397b1dcdaf`；`Mix(1) = 0x910a2dec89025cc1`。

**T3 键派生与抽取**（`worldSeed = 12345`，`For(SquadSim = 3, entityKey = 7, tick = 1000, salt = 1)`）
- 前 3 次 `NextUInt()`：`0x37717ac4, 0x2e504a5e, 0xeeeaf032`。
- 新建同一流，`NextDouble()` = `0.2165753109821128`（= `((0x37717ac4>>5) × 2^26 + (0x2e504a5e>>6)) / 2^53`）。
- 新建同一流，连续 5 次 `NextInt(6)`：`1, 1, 5, 1, 2`。

**T4 分布函数**（同 T3 的流，每项新建）
- `NextGaussian()`：u1 = 1 − 0.2165753109821128，u2 = 0.9332723713828678 → **0.6381715817878965**（容差 1e-15；DMath 与 libm 可能差 1 ulp，以 C# DMath 输出为黄金值）。
- `WeightedChoice([1, 3, 0, 6])`：x = 0.21657531 × 10 = 2.1658；累积 1, 4 → 返回 **1**。
- `WeightedChoice([0, 0])` → −1，且之后 `NextUInt()` 仍为 `0x37717ac4`（未消耗）。

**T5 DMath 黄金值**（正确舍入结果；fdlibm 应逐位给出）
| 调用 | 期望（十六进制位模式 / 十进制） |
|---|---|
| `DMath.Exp(1)` | `0x4005BF0A8B145769`（2.718281828459045） |
| `DMath.Log(2)` | `0x3FE62E42FEFA39EF`（0.6931471805599453） |
| `DMath.Sin(0.5)` | 0.479425538604203 |
| `DMath.Cos(1)` | 0.5403023058681398 |
| `DMath.Atan2(1, 1)` | 0.7853981633974483 |
| `DMath.Pow(2, 0.5)` | 1.4142135623730951 |
| `DMath.Exp(-0.9)` | 0.4065696597405991（12 §8 T5 的 logistic 用到） |

**T6 规范化编码**
- `VarU(300)` → 字节 `AC 02`；`VarI(−1)` → ZigZag 1 → `01`；`VarI(64)` → ZigZag 128 → `80 01`。
- `F64(−0.0)` 与 `F64(+0.0)` 写出相同 8 字节 `00…00`；`F64(NaN)` 抛异常。
- 一个 `Dictionary<int,double>{ {3,1.0}, {1,2.0} }` 必须写成键顺序 1, 3（写入器拒绝未排序的输入）。

**T7 状态哈希敏感性**
两个世界只差一个营的 `fatigue`：0.5 vs 0.5000000000000001 → `stateHash` 不同，且 `sectionHashes` 只在该营所在段（`SquadCombat` 或 `Org`）不同。只差 `−0.0` vs `+0.0` → 哈希相同。

**T8 存读档往返（H2 的单例）**
`nk_2020` 运行到第 1 234 刻（20:34，小时中间、至少 1 个片段进行中）存档；继续到第 1 440 刻得 hash A。读档后运行到第 1 440 刻得 hash B。期望 A == B。

**T9 静态 id 重映射**
存档 `StaticIdTables[Model] = ["bmp2", "t72b", "zu23"]`（句柄 0,1,2）；新数据中排序后为 `["bmp2", "btr80", "t72b", "zu23"]`。期望 remap：0→0，1→2，2→3。若新数据删除了 `zu23` 且无 `replaced_by` → 2→−1，警告 1 条。

**T10 输入日志回放**
脚本玩家在第 100 刻下 1 条 Move、第 100 刻再标星 1 个营（seq 0、1），第 500 刻改 `FidelityProfile = High`。从头回放 1 440 刻，期望每小时哈希与实时记录一致，`BattleLogs` 段哈希一致。回放器必须严格按记录的 `(tick, seq)` 顺序重新提交。

---

## 9. 验证建议

| 编号 | 脚本 | 内容 | 通过标准 |
|---|---|---|---|
| H7 | `tools/determinism/pcg_ref.py` | Python 参考实现 `Pcg32`、`Mix`、`For`、`NextDouble`、`NextInt`、`NextGaussian`（numpy 无关，纯整数运算）；输出 T1–T4 向量；CI 中与 C# 单元测试互比 | 完全一致 |
| H6 | `tools/determinism/dmath_check.py` | 用 `mpmath` 生成 10^6 点高精度参考值文件，C# 测试读入比对 ulp 误差 | ≤ 1 ulp |
| V6 | `tools/validate/v6_save_perf.py` + C# 基准 | 纳卡满规模世界：快照耗时、压缩耗时、文件大小、每小时哈希耗时 | 快照 ≤ 150 ms（模拟停顿上限）；哈希 ≤ 60 ms；存档 ≤ 20 MB（不含回放） |
| — | `tools/determinism/rng_stats.py` | 对 `For` 派生的 10^4 条短流（每条 16 个值）做卡方均匀性与相邻流相关性检验（相邻 entityKey/tick/salt） | 无显著相关（p > 0.001）；可选 PractRand 长流测试 |
| — | `tools/determinism/golden_diff.py` | H1/H4 失败时比较两份 `ChecksumLog`，输出第一个不同的刻与段 | 工具可用 |
| V7 | — | 不涉及（存档操作不算决策） | — |

---

## 10. 待确认决策（🟡）

| 编号 | 决策 | 建议 | 理由 | 备选 |
|---|---|---|---|---|
| D-01 | 存档编码 | 自定义规范化二进制 + 每段 Brotli | 同一套写入器同时用于状态哈希；无第三方依赖；段可独立迁移/跳过 | MessagePack（需额外保证规范化）；JSON（太大） |
| D-02 | 哈希算法 | XxHash64（`System.IO.Hashing`） | 快、纯托管、跨平台确定 | FNV-1a 64（更慢）；SHA-256（过重） |
| D-03 | 存档时机与自动存档 | 只在两刻之间；每游戏日 + 战争开始/停火各一份；轮换 5 份 | 刻是原子的；简单 | 每游戏周 |
| D-04 | 静态数据变化的处理 | 存档带 `StaticIdTable`，按字符串 id 重映射；支持 `deprecated`/`replaced_by` | 00 §2.2 句柄按排序编号，新增数据会改变句柄 | 存档直接存字符串 id（更大更慢） |
| D-05 | 回放保留 | 最近 50 场 + 进行中；条带层全部精度都记，班级只记 Full；位置量化 10 m | ✅ §11.4；体积可控 | 100 场；按体积上限保留 |
| D-06 | 输入日志范围 | 存档中保留开局以来全部玩家输入；完整回放只在同一构建可用 | bug 复现与确定性测试的基础；体积小 | 只保留最近一次自动存档以来的输入 |
| D-07 | `DMath` 实现 | 移植 fdlibm 5.3（不含大参数约简） | 成熟、误差 < 1 ulp、纯算术 → 确定 | CORE-MATH（正确舍入，移植量大）；查表 + 多项式（精度低） |
| D-08 | 分布近似 | Box–Muller（丢弃一半）；Poisson λ < 30 Knuth、否则正态近似；Binomial n ≤ 64 逐个、否则正态近似 | 简单、确定、消耗次数可预期；精度对游戏足够 | PTRS / BTPE 精确算法 |
| D-09 | 跨平台确定性的地位 | 阶段 1：CI 检测、只告警；多人模式前必须全绿；无法消除时局部改定点 | G-20：硬需求是同机复现 | 阶段 1 就强制 |
| D-10 | 多人模式架构 | 锁步 + 输入延迟 + 定期哈希（阶段 2+，取决于 §21-22） | 状态量太大，不适合状态同步 | 服务器权威 |
| D-11 | 与世界无关的随机流 | `Rng.ForKey`（worldSeed 视为 0），用于 `OutcomeCache` 等 | 03 要求缓存内容与存档无关，可跨存档共享磁盘缓存 | 也混入 worldSeed（每局缓存不同，无法共享） |
| D-12 | 版本兼容策略 | §4.7 表：旧档可迁移读取；回放只限同一构建 | 现实可行 | 不兼容旧档 |
| D-13 | 非有限浮点 | 写入即抛异常；−0 规范化 | 尽早暴露 bug；哈希稳定 | 静默替换为 0 |
| D-14 | 校验频率 | 调试/多人：每 60 刻（多人 10 刻），记录分段哈希 | 定位去同步 | 每刻（太贵） |
| D-15 | 单存档（铁人）模式 | 可选，不默认 | 种子随档已防刷；铁人只是偏好 | 不做 |
| D-16 | 运行时 ID 宽度 | `int`，`PersonnelId` 视规模改 `long` | 阶段 1 人员 < 50 万，含补充新兵十年累计也 < 2^31 | 全部 `long` |
| D-17 | 派生缓存是否存档 | 周期性重建、两次重建之间被读取的派生量必须存档（如 12 的影响力图）；每步整体重算的不存 | 保证“小时中间读档”仍逐位一致 | 存档只允许在整点（限制玩家） |

---

## 11. 新增术语

| 中文 | 英文标识 | 定义 | 归属 |
|---|---|---|---|
| 存档段 | `SectionId` / `SectionEntry` / `SectionFlags` | 存档中按系统划分、独立版本与压缩的数据块 | 15 |
| 存档头 | `SaveHeader` | 格式版本、游戏版本、数据哈希、种子、状态哈希、段表 | 15 |
| 静态 ID 表 | `StaticIdTable` / `StaticKind` | 运行时句柄 → snake_case id 的映射，读档时用于重映射 | 15 |
| 规范化写入器 | `CanonicalWriter` / `CanonicalReader` | 保证同一状态得到同一字节序列的序列化器 | 15 |
| 段序列化器 | `ISectionSerializer` / `SaveRegistry` | 各规格注册自己状态的读写 | 15 |
| 状态哈希 | `stateHash` / `sectionHashes` | 规范化序列化后的 XxHash64，确定性检查与去同步定位 | 15 |
| 校验和记录 | `ChecksumRecord` | 某刻的状态哈希与分段哈希 | 15 |
| 输入日志 | `InputLog` / `InputRecord` / `InputKind` | 影响模拟结果的玩家输入序列，用于完整回放 | 15 |
| 完整回放 | full replay | 初始条件 + 输入日志重新模拟 | 15 |
| 战斗记录段 | `BattleLog` / `BattleLogSegment` / `BattleEventRecord` / `BattleEventKind` | `BattleEventLog` 的具体存储结构 | 15 |
| 与世界无关的流 | `Rng.ForKey` | worldSeed 视为 0 的键派生随机流 | 15 |
| 确定性数学库 | `DMath` | fdlibm 移植的纯 C# 超越函数 | 15 |
| 黄金哈希 | golden hashes | 仓库中固定场景的期望状态哈希序列 | 15 |
| 派生缓存段 | `AiDerivedCache` | 需要存档的 AI 派生数据（见 12） | 15 / 12 |
