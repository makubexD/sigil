// The defects planted for requests/code-reviewer.json, one case each. `at` is the text of the
// planted line (or the first and last line), `fn` the function it is in as a review would write it,
// `words` the ways of naming the defect. Patterns are loose on purpose and the same for both arms.
const GO = 'go-ledger';
const RUST = 'rs-queue';
const JAVA = 'java-orders';
const LEDGER = ['internal/ledger/ledger.go', 'internal/ledger/export.go'];
const RATES = ['internal/rates/client.go', 'internal/rates/cache.go'];
const QUEUE = ['src/queue.rs', 'src/retry.rs'];
const ORDERS = 'src/main/java/com/acme/orders/';
const SERVICE = [ORDERS + 'OrderService.java', ORDERS + 'DiscountPolicy.java'];
const STORE = [ORDERS + 'OrderRepository.java', ORDERS + 'ReportWriter.java'];

export const CASES = {
  // R1: internal/ledger.
  'transfer-partial': {
    fixture: GO,
    group: LEDGER,
    file: LEDGER[0],
    at: [['l.post(from, -cents', 'l.post(to, cents']],
    fn: /\bTransfer\b/,
    words:
      /atomic|roll(ed|s|ing)?[ -]?back|partial(ly)?|half[- ](done|applied|complete|way)|already (been )?(debited|applied|posted|withdrawn|deducted|committed)|debit(ed)?\b.{0,100}(remain|stay|persist|lost|not (undone|reversed|restored|refunded))|not (undone|reversed|restored)|money (is )?(lost|disappears|vanishes)|inconsistent/,
  },
  'entries-race': {
    fixture: GO,
    group: LEDGER,
    file: LEDGER[0],
    at: ['for _, entry := range l.entries'],
    fn: /\bEntries\b/,
    words:
      /\brace\b|without (holding |taking |acquiring )?(a |the |any )?(read )?(lock|mutex)|unsynchroni[sz]ed|not (locked|synchroni[sz]ed|protected|guarded|thread[- ]safe)|no (lock|locking|mutex)|missing (a |the )?(read )?(lock|RLock|mutex)|RLock|unlocked|unprotected|(lock|mutex).{0,40}(not|never) (held|taken|acquired)/,
  },
  'defer-loop': {
    fixture: GO,
    group: LEDGER,
    file: LEDGER[1],
    at: ['defer file.Close()'],
    fn: /\bExportCSV\b/,
    words:
      /defer.{0,120}(loop|iteration|until .{0,40}return|function (returns|exits)|accumulat|pile)|(loop|iteration).{0,120}defer|file (handles?|descriptors?)|too many open files|stays? open|remains? open|EMFILE|ulimit/,
  },
  'amount-format': {
    fixture: GO,
    group: LEDGER,
    file: LEDGER[1],
    at: ['fmt.Sprintf("%d.%d"'],
    fn: /\bformatAmount\b/,
    words:
      /%02d|pad(ded|ding|s)?\b|leading zero|single[- ]digit|\b\d+\.5"|"\d+\.\d"|negative|two digits|\b1205\b|\.05\b|-\d+\.-\d+/,
  },

  // R2: internal/rates.
  'ctx-ignored': {
    fixture: GO,
    group: RATES,
    file: RATES[0],
    at: ['http.NewRequest(', 'lastErr = err'],
    fn: /\bFetch\b/,
    words:
      /NewRequestWithContext|(ctx|context)\b.{0,80}(ignored|unused|never used|not used|not passed|not propagated|isn't used|is not used|not respected|not honou?red|not checked|never checked)|(ignor(es?|ed|ing)|never (uses|checks|passes)|does(n't| not) (use|pass|check|respect|honou?r)).{0,60}(ctx|context|cancel)|cancel\w*.{0,80}(not|never|no effect|ignored)|ctx\.Done/,
  },
  'body-leak': {
    fixture: GO,
    group: RATES,
    file: RATES[0],
    at: ['if resp.StatusCode != http.StatusOK'],
    fn: /\bFetch\b/,
    words:
      /(body|resp\.Body)\b.{0,120}(not closed|never closed|isn't closed|is not closed|unclosed|leak|without clos|not being closed|must be closed|should be closed|needs to be closed|closed only|only closed)|(leak|not clos|never clos|doesn't close|does not close|without closing|fails to close|missing .{0,20}close).{0,120}(body|connection|resp)|connection (leak|reuse|pool)/,
  },
  'no-timeout': {
    fixture: GO,
    group: RATES,
    file: RATES[0],
    at: ['HTTP: &http.Client{}', 'c.HTTP.Do(req)'],
    fn: /\bNewClient\b|http\.Client|HTTP client/i,
    words: /time-?outs?\b|(hang|wait|block)s? (forever|indefinitely)/,
  },
  'nil-map': {
    fixture: GO,
    group: RATES,
    file: RATES[1],
    at: ['return &Cache{client: client, ttl: ttl}', 'c.rates[pair] = cached'],
    fn: /\bNewCache\b|\bGet\b/,
    words:
      /nil map|map\b.{0,60}(nil|never (initiali[sz]ed|made|created|allocated)|not (initiali[sz]ed|made|created|allocated)|uninitiali[sz]ed)|(nil|uninitiali[sz]ed).{0,40}map|panic.{0,80}(map|rates)|make\(map/,
  },
  'ttl-inverted': {
    fixture: GO,
    group: RATES,
    file: RATES[1],
    at: ['time.Since(entry.at) > c.ttl'],
    fn: /\bGet\b/,
    words:
      /invert|backwards?|reversed?|flipped|wrong (way|direction|comparison|operator|sign)|opposite|should be <|<=? ?c\.ttl|stale|older than (the )?ttl|only (after|once|when) .{0,40}expir|never (served|used|hit|returned)|always (fetch|refetch|miss)/,
  },

  // R3: the queue and its retry timing.
  deadlock: {
    fixture: RUST,
    group: QUEUE,
    file: QUEUE[0],
    at: ['if self.is_full() {'],
    fn: /\bpush\b/,
    words:
      /dead-?lock|re-?entran|lock(s|ed|ing)? (it |the mutex |the lock |the same mutex )?(again|twice|a second time)|second lock|already (locked|held)|while (still )?holding|double[- ]lock|hangs?\b/,
  },
  'requeue-order': {
    fixture: RUST,
    group: QUEUE,
    file: QUEUE[0],
    at: ['inner.pending.push_back(job);'],
    fn: /\brequeue\b/,
    words:
      /push_front|\bfront\b|back of|end of the queue|at the end|\btail\b|behind newer|after newer|wrong end/,
  },
  'fill-percent': {
    fixture: RUST,
    group: QUEUE,
    file: QUEUE[0],
    at: ['(self.len() * 100 / self.capacity) as u8'],
    fn: /fill_percent/,
    words:
      /divi(de|sion|des|ding)[- ]by[- ]zero|by zero|capacity\b.{0,60}(\b0\b|zero)|zero capacity|truncat|overflow|\bwraps?\b|exceeds? (100|255|capacity|the capacity)|(over|above|more than) 100|as u8/,
  },
  'backoff-overflow': {
    fixture: RUST,
    group: QUEUE,
    file: QUEUE[1],
    at: [['2u32.pow(attempt)', 'base * factor']],
    fn: /\bbackoff\b/,
    words:
      /overflow|checked_pow|checked_mul|saturating|\bwrap(s|ping)?\b|panic|attempt.{0,40}(32|31)|2\^32|u32::MAX/,
  },
  'retry-after-panic': {
    fixture: RUST,
    group: QUEUE,
    file: QUEUE[1],
    at: ['header.trim().parse().unwrap()'],
    fn: /parse_retry_after/,
    words: /unwrap|panic|HTTP[- ]date|non[- ]numeric|not a number|malformed|crash/,
  },

  // R4: the order service and its discounts.
  'modified-in-loop': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[0],
    at: ['open.remove(order.getId());'],
    fn: /\bcancelAll\b/,
    words:
      /ConcurrentModification|while iterating|during (the )?iteration|modif(y|ies|ied|ying|ication).{0,80}(iterat|loop)|(iterat|loop).{0,80}(modif|remov)|remov(e|es|ed|ing)\b.{0,80}(loop|iterat|for-each)|removeIf|iterator/,
  },
  'integer-identity': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[0],
    at: ['first.getPriority() == second.getPriority()'],
    fn: /\bsamePriority\b/,
    words:
      /==|reference|identity|Integer cache|-128|\b127\b|boxed|\.equals\(|Objects\.equals|intValue|unbox/,
  },
  'optional-null': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[0],
    at: ['return Optional.of(order);'],
    fn: /\bfind\(|`find`|Optional\.of\b/,
    words: /ofNullable|NullPointerException|\bNPE\b|\bnull\b/,
  },
  'string-identity': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[1],
    at: ['if (tier == "VIP")'],
    fn: /\bdiscountFor\b/,
    words:
      /==|reference|identity|\.equals\(|equalsIgnoreCase|intern|never (true|matches|applied|applies)|always (false|zero)/,
  },
  'bigdecimal-scale': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[1],
    at: ['equals(BigDecimal.ZERO)'],
    fn: /\bisFree\b/,
    words: /compareTo|signum|\bscale\b|0\.00/,
  },
  'formatter-shared': {
    fixture: JAVA,
    group: SERVICE,
    file: SERVICE[1],
    at: ['private static final SimpleDateFormat DAY', 'DAY.parse(day)'],
    fn: /\bisPromoDay\b|SimpleDateFormat/,
    words:
      /thread[- ]?safe|thread-unsafe|concurren|\brace\b|DateTimeFormatter|ThreadLocal|(across|between|by) (multiple |several |request )?threads|synchroni[sz]/,
  },

  // R5: storage and the daily report.
  'sql-injection': {
    fixture: JAVA,
    group: STORE,
    file: STORE[0],
    at: [['WHERE status = \'" + status', '+ sortColumn;']],
    fn: /\bfindByStatus\b/,
    words: /inject|concatenat|parameteri[sz]ed|PreparedStatement|\bbind\b|whitelist|allow-?list/,
  },
  'connection-leak': {
    fixture: JAVA,
    group: STORE,
    file: STORE[0],
    at: [
      ['List<Order> orders = new ArrayList<>();', 'ResultSet rows = statement.executeQuery(sql);'],
    ],
    fn: /\bfindByStatus\b/,
    words:
      /try[- ]with[- ]resources|(never|not|aren't|isn't) (being )?(closed|released)|\bleak|unclosed|close\(\)|exhaust|without closing|returned to the pool/,
  },
  'error-swallowed': {
    fixture: JAVA,
    group: STORE,
    file: STORE[0],
    at: ['e.printStackTrace();'],
    fn: /\bfindByStatus\b/,
    words:
      /swallow|printStackTrace|silent|suppress|empty list|partial|\bhid(es?|den)\b|\bmasks?\b|ignor(es?|ed|ing) (the )?(exception|error|SQLException)|rethrow|propagat/,
  },
  'sum-discarded': {
    fixture: JAVA,
    group: STORE,
    file: STORE[1],
    at: ['sum.add(order.getTotal());'],
    fn: /\baverage\b/,
    words:
      /immutable|discard|(not|never) (re)?assigned|reassign|sum = sum\.add|always (be |return |returns |is )?(zero|0\b)|result\b.{0,40}(ignored|unused|thrown away|lost|dropped)|return value.{0,40}(ignored|unused)|(stays?|remains?) (at )?(zero|0\b)/,
  },
  'empty-divide': {
    fixture: JAVA,
    group: STORE,
    file: STORE[1],
    at: ['sum.divide(BigDecimal.valueOf(orders.size())'],
    fn: /\baverage\b/,
    words:
      /\bempty\b|no orders|divi(de|sion|des|ding)[- ]by[- ]zero|by zero|ArithmeticException|zero orders|isEmpty/,
  },
  'sort-direction': {
    fixture: JAVA,
    group: STORE,
    file: STORE[1],
    at: ['orders.sort((a, b) ->'],
    fn: /\blargestFirst\b/,
    words:
      /ascending|smallest|\brevers|wrong (order|direction|way)|opposite|b\.getTotal\(\)\.compareTo|backwards?|inverted|lowest first|not descending/,
  },
  'sort-in-place': {
    fixture: JAVA,
    group: STORE,
    file: STORE[1],
    at: ['orders.sort((a, b) ->', 'return orders;'],
    fn: /\blargestFirst\b/,
    words:
      /mutat|in[- ]place|(not|no|isn't|never) (a |makes a |made a )?copy|caller'?s list|(original|input|same|passed) list|modif(y|ies|ied|ying).{0,60}(list|argument|input|parameter|original|caller)|side effect|new ArrayList|defensive copy|UnsupportedOperation/,
  },
};
