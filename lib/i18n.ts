import { cookies } from "next/headers"

/**
 * Interface language.
 *
 * Amharic and English are both first-class: neither is a translation layer over
 * the other, and every string on a public page exists in both before it ships.
 * There is no i18n library here on purpose -- two languages and a few hundred
 * keys is a typed object, and a runtime that ships a parser to the browser to
 * look up strings the server already knows is a cost with no return on
 * Ethiopian mobile data.
 *
 * Seller-written content is never translated. A title the seller wrote in
 * Amharic renders in Amharic on an English page, because it is their words
 * about their item. Only the chrome switches.
 */

export type Lang = "en" | "am"

/**
 * Not httpOnly: the toggle is a plain form post, but the cookie is also the
 * thing that tells us not to re-run Accept-Language sniffing on every request,
 * and there is nothing in it worth protecting.
 */
export const LANG_COOKIE = "gulit.lang"

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "am"
}

/**
 * The language for this request.
 *
 * Reads the cookie the proxy has already resolved. `cookies()` is memoised per
 * request, so the layout and every section calling this share one read.
 */
export async function getLang(): Promise<Lang> {
  const store = await cookies()
  const value = store.get(LANG_COOKIE)?.value
  return isLang(value) ? value : "en"
}

/**
 * Amharic runs 20-35% longer than English at the same meaning, and Ethiopic
 * glyphs are taller. Both facts are handled in CSS off `:lang(am)` rather than
 * per-string, but it means every headline below is written so the *Amharic*
 * fits the measure -- the English is the one with room to spare, not the
 * reverse.
 */
const en = {
  // ---- chrome -------------------------------------------------------------
  langGroupLabel: "Interface language",
  langEnglish: "English",
  langAmharic: "Amharic",
  skipToResults: "Skip to results",
  navBrowse: "Browse",
  wordmarkTag: "marketplace",
  wordmarkSr: "— used goods across Addis Ababa",
  sellShort: "Sell",
  logIn: "Log in",
  logOut: "Log out",
  signedIn: "Signed in",

  // ---- hero ---------------------------------------------------------------
  heroTitle: "Everything Addis is selling, in one place.",
  heroLede:
    "The used-goods market lives in Telegram channels. We index them, collapse the cross-posts, and make the whole thing searchable.",
  searchLabel: "Search listings. A whole phrase works as well as a keyword.",
  searchPlaceholder: "laptop in Bole under 20000",
  searchAction: "Search",
  browseAll: (n: string) => `Browse all ${n} listings`,

  // ---- credibility band ---------------------------------------------------
  indexHeading: "The index today",
  statListings: "listings live",
  statChannels: "channels indexed",
  statMerged: "cross-posts merged",
  statCaptured: "since last capture",
  capturedAgo: (ago: string) => `captured ${ago}`,
  statPending: "posts awaiting dedup",
  captureStalled: (ago: string) =>
    `Last capture ${ago}. These figures are accurate as of then, not as of now.`,

  // ---- inventory ----------------------------------------------------------
  inventoryTitle: "On the market now",
  inventoryLede:
    "Photographed listings, newest first, priced as their sellers wrote them.",
  seeEverything: "See everything",

  // ---- the collapse -------------------------------------------------------
  collapseTitle: (n: number) =>
    n === 1 ? "One post. One item." : `${n} posts. One item.`,
  collapseLede: (n: number) =>
    `The same item, posted to ${n} channels under one phone number, at ${n} different prices. Gulit shows it once, at the lowest.`,
  collapseLedger: (posts: number, channels: number) =>
    `${posts} posts · ${channels} channels · one phone number`,
  collapseResult: "One listing",
  collapseFrom: (price: string) => `from ${price} ETB`,
  collapseSpread: (price: string) => `${price} ETB apart across channels`,
  collapseOpen: "Open the merged listing",
  collapseHow:
    "Matched on the phone number first, then the photo hash, then the wording. Never across categories.",
  collapseSingle: (handle: string) =>
    `Indexed once, from @${handle}. Nothing else in the index matches it yet.`,
  collapseSingleNote:
    "Most listings are posted once. The merge only fires when two posts really are the same item.",
  postedOn: "posted",
  askingPrice: "asking",

  // ---- categories ---------------------------------------------------------
  categoriesTitle: "Start where the goods are",
  categoriesLede:
    "Live counts straight out of the index. A category with nothing in it is not listed.",

  // ---- search intelligence ------------------------------------------------
  searchTitle: "Type it the way you would say it",
  searchLede:
    "One sentence becomes filters you can see and correct. Tapping a keyboard is slow on a phone, so the phrase does the work of four taps.",
  spellingsNote:
    "All three return the same sofas: Amharic, English, and the Latin spelling people actually type.",

  // ---- price fairness -----------------------------------------------------
  priceTitle: "Is that a fair price",
  priceLede:
    "Every asking price is placed against what comparable items in the same condition actually go for, so a number stops being one you have to guess about.",
  priceTypical: "typical price",
  priceRange: (n: string) => `Where half of these sales sit, from ${n} listings.`,
  verdictBelow: "Below range",
  verdictBelowBody: "Cheaper than most comparable sales.",
  verdictTypical: "Typical",
  verdictTypicalBody: "Inside the middle half of the range.",
  verdictAbove: "Above range",
  verdictAboveBody: "Dearer than most. Sometimes justified.",
  verdictSuspicious: "Suspicious",
  verdictSuspiciousBody:
    "Far below the range. Treat any request to pay ahead as a scam.",

  // ---- alerts -------------------------------------------------------------
  alertsTitle: "Tell us what you are hunting for",
  alertsLede:
    "We watch every channel. When something matching turns up, you get a Telegram message instead of scrolling for it.",
  alertsPlaceholder: "iPhone 12 under 30000",
  alertsLabel: "What should we watch for?",
  alertsAction: "Create alert",
  alertsSignedOut: "Sign in with Telegram to keep an alert.",
  alertsSaved: "Alert saved. We will message you on Telegram when it appears.",
  alertsFailed: "That did not save. Try again in a moment.",

  // ---- provenance ---------------------------------------------------------
  provenanceTitle: "Where this comes from",
  provenanceBody1:
    "Every indexed listing began as a post in a public Telegram channel. We store the message verbatim before anything reads it, extract the price, phone number, category and area from it, and credit the channel it came from.",
  provenanceBody2:
    "We do not stand between you and the seller. There is no checkout, no escrow and no commission. Every listing links back to the original post, and contact goes to the number the seller wrote. If a listing is yours and you want it gone, one tap removes it.",
  tiersTitle: "Three kinds of listing",
  tierIndexedTitle: "Collected from a Telegram channel",
  tierIndexedBody:
    "Searchable here, credited to the channel, linked back to the original post. The seller is unverified and the tag says so.",
  tierClaimedTitle: "The seller proved the number is theirs",
  tierClaimedBody:
    "We send a code to the phone number already in the post. Passing it turns a scraped row into an account that can edit the listing.",
  tierNativeTitle: "Posted directly on Gulit",
  tierNativeBody:
    "A signed-in seller, in-app contact, and a rating history you can read before you travel across town.",
  pipelineTitle: "How a post becomes a listing",
  pipelineListen: "Listen",
  pipelineListenBody: "A Telethon client watches every allowlisted channel.",
  pipelineStore: "Store raw",
  pipelineStoreBody: "Messages land in Postgres verbatim, before anything reads them.",
  pipelineExtract: "Extract",
  pipelineExtractBody: "Price and phone by regex; the rest in batches.",
  pipelineDedup: "Deduplicate",
  pipelineDedupBody: "Phone, image hash and text vote on whether two posts are one item.",
  pipelinePublish: "Publish or queue",
  pipelinePublishBody: "Doubtful extractions go to a moderator, not to the grid.",

  // ---- sell ---------------------------------------------------------------
  sellTitle: "Sell what you are not using",
  sellLede:
    "Sign in with Telegram, add your photos, and a suggested price comes back from comparable sales. Pick a condition, tag your area, publish.",
  sellAction: "Sell an item",
  sellNote: "Buyers reach you on Telegram or by phone, the way they already do.",

  // ---- footer -------------------------------------------------------------
  footerBlurb: (channels: string) =>
    `Gulit indexes second-hand listings from ${channels} Telegram channels across Addis Ababa. We link back to every original post and route contact to the seller who wrote it.`,
  footerBrowse: "Browse",
  footerMarketplace: "Marketplace",
  footerTrust: "Trust & safety",
  footerBrowseListings: "Browse listings",
  footerNative: "Posted on Gulit",
  footerCrossPosted: "Cross-posted items",
  footerHowItWorks: "How Gulit works",
  footerMeetingSafely: "Meeting a seller safely",
  footerScamPatterns: "Scam patterns to know",
  footerReport: "Report a listing",
  footerTagline: "ጉሊት — the open-air market, indexed",
  footerRights:
    "Indexed listings remain the property of whoever posted them. If a listing is yours and you want it gone, one tap removes it.",

  // ---- empty / degraded ---------------------------------------------------
  freshTitle: "Nothing indexed yet.",
  freshLede:
    "The channels are configured and the listener is the next thing to start. Search works the moment the first post lands.",
  noCaptureYet: "no captures yet",
  noPhoto: "No photo",
  priceOnRequest: "Price on request",
}

/**
 * The English table is the shape of record: `am` is typed against it, so a key
 * added on one side and forgotten on the other is a build error rather than an
 * English string surfacing mid-Amharic page.
 */
type Strings = typeof en

const am: Strings = {
  // ---- chrome -------------------------------------------------------------
  langGroupLabel: "የገጹ ቋንቋ",
  langEnglish: "እንግሊዝኛ",
  langAmharic: "አማርኛ",
  skipToResults: "ወደ ውጤቶቹ ዝለል",
  navBrowse: "ይመልከቱ",
  wordmarkTag: "ገበያ",
  wordmarkSr: "— በአዲስ አበባ ያሉ ያገለገሉ እቃዎች",
  sellShort: "ሽጥ",
  logIn: "ይግቡ",
  logOut: "ይውጡ",
  signedIn: "ገብተዋል",

  // ---- hero ---------------------------------------------------------------
  heroTitle: "አዲስ አበባ የምትሸጠው ሁሉ፣ በአንድ ቦታ።",
  heroLede:
    "የሁለተኛ እጅ ገበያው በቴሌግራም ቻናሎች ውስጥ ነው። እኛ እንሰበስባቸዋለን፣ ተደጋጋሚ ልጥፎችን አንድ እናደርጋለን፣ ሁሉንም በአንድ ቦታ እንዲፈለግ እናደርጋለን።",
  searchLabel: "ማስታወቂያዎችን ይፈልጉ። ሙሉ ሐረግም እንደ አንድ ቃል ይሠራል።",
  searchPlaceholder: "ላፕቶፕ ቦሌ ከ20000 በታች",
  searchAction: "ፈልግ",
  browseAll: (n: string) => `ሁሉንም ${n} ማስታወቂያዎች ይመልከቱ`,

  // ---- credibility band ---------------------------------------------------
  indexHeading: "የዛሬው መዝገብ",
  statListings: "ቀጥታ ማስታወቂያዎች",
  statChannels: "የተሰበሰቡ ቻናሎች",
  statMerged: "የተዋሃዱ ተደጋጋሚ ልጥፎች",
  statCaptured: "ካለፈው ስብሰባ ጀምሮ",
  capturedAgo: (ago: string) => `${ago} ተሰብስቧል`,
  statPending: "ውህደት የሚጠብቁ ልጥፎች",
  captureStalled: (ago: string) =>
    `የመጨረሻው ስብሰባ ${ago} ነበር። እነዚህ ቁጥሮች የዚያን ጊዜ ትክክል ናቸው፣ የአሁኑን አይደሉም።`,

  // ---- inventory ----------------------------------------------------------
  inventoryTitle: "አሁን በገበያ ላይ",
  inventoryLede:
    "ፎቶ ያላቸው ማስታወቂያዎች፣ አዲሶቹ ቀድመው። ዋጋው ሻጮች እንደጻፉት ነው።",
  seeEverything: "ሁሉንም ይመልከቱ",

  // ---- the collapse -------------------------------------------------------
  collapseTitle: (n: number) =>
    n === 1 ? "አንድ ልጥፍ። አንድ እቃ።" : `${n} ልጥፎች። አንድ እቃ።`,
  collapseLede: (n: number) =>
    `ተመሳሳይ እቃ በአንድ ስልክ ቁጥር ወደ ${n} ቻናሎች ተለጥፎ በ${n} የተለያዩ ዋጋዎች ቀርቧል። ጉሊት አንድ ጊዜ ብቻ፣ በዝቅተኛው ዋጋ ያሳያል።`,
  collapseLedger: (posts: number, channels: number) =>
    `${posts} ልጥፎች · ${channels} ቻናሎች · አንድ ስልክ ቁጥር`,
  collapseResult: "አንድ ማስታወቂያ",
  collapseFrom: (price: string) => `ከ${price} ብር ጀምሮ`,
  collapseSpread: (price: string) => `በቻናሎች መካከል የ${price} ብር ልዩነት`,
  collapseOpen: "የተዋሃደውን ማስታወቂያ ክፈት",
  collapseHow:
    "በመጀመሪያ በስልክ ቁጥር፣ ቀጥሎ በፎቶ ሃሽ፣ ቀጥሎ በአጻጻፍ ይዛመዳል። በተለያዩ ምድቦች መካከል በፍጹም አይዋሃድም።",
  collapseSingle: (handle: string) =>
    `ከ@${handle} አንድ ጊዜ ብቻ ተሰብስቧል። እስካሁን በመዝገቡ ውስጥ የሚዛመደው ሌላ ልጥፍ የለም።`,
  collapseSingleNote:
    "አብዛኞቹ ማስታወቂያዎች አንድ ጊዜ ብቻ ይለጠፋሉ። ውህደቱ የሚሠራው ሁለት ልጥፎች በእውነት አንድ እቃ ሲሆኑ ብቻ ነው።",
  postedOn: "ተለጠፈ",
  askingPrice: "ጠይቋል",

  // ---- categories ---------------------------------------------------------
  categoriesTitle: "እቃው ወደሚገኝበት ይሂዱ",
  categoriesLede:
    "ከመዝገቡ በቀጥታ የተወሰዱ ቁጥሮች። ምንም የሌለበት ምድብ አይዘረዘርም።",

  // ---- search intelligence ------------------------------------------------
  searchTitle: "እንደሚናገሩት ይጻፉ",
  searchLede:
    "አንድ ሐረግ ወደሚታዩና ወደሚስተካከሉ ማጣሪያዎች ይቀየራል። በስልክ ላይ መተየብ ዘገምተኛ ነው፤ ስለዚህ አንድ ሐረግ የአራት ጠቅታ ሥራ ይሠራል።",
  spellingsNote:
    "ሦስቱም ተመሳሳይ ሶፋዎችን ያመጣሉ፦ አማርኛ፣ እንግሊዝኛ፣ እና ሰዎች በተግባር የሚጽፉት የላቲን አጻጻፍ።",

  // ---- price fairness -----------------------------------------------------
  priceTitle: "ዋጋው ተገቢ ነው?",
  priceLede:
    "ሁሉም የተጠየቀ ዋጋ በተመሳሳይ ሁኔታ ላይ ካሉ አቻ እቃዎች ትክክለኛ ሽያጭ ጋር ይመዘናል። ስለዚህ ዋጋው መገመት የሚያስፈልገው ቁጥር መሆኑ ያቆማል።",
  priceTypical: "መደበኛ ዋጋ",
  priceRange: (n: string) => `ከ${n} ማስታወቂያዎች፣ ግማሹ ሽያጭ የሚገኝበት ክልል።`,
  verdictBelow: "ከክልሉ በታች",
  verdictBelowBody: "ከአብዛኞቹ አቻ ሽያጮች ያነሰ ዋጋ።",
  verdictTypical: "መደበኛ",
  verdictTypicalBody: "በክልሉ መካከለኛ ግማሽ ውስጥ ነው።",
  verdictAbove: "ከክልሉ በላይ",
  verdictAboveBody: "ከአብዛኞቹ የበለጠ ውድ። አንዳንድ ጊዜ ምክንያት አለው።",
  verdictSuspicious: "አጠራጣሪ",
  verdictSuspiciousBody:
    "ከክልሉ በጣም ያነሰ። አስቀድሞ ክፈል የሚል ጥያቄ ሁሉ እንደ ማጭበርበር ይቁጠሩት።",

  // ---- alerts -------------------------------------------------------------
  alertsTitle: "የሚፈልጉትን ይንገሩን",
  alertsLede:
    "እኛ ሁሉንም ቻናል እንከታተላለን። የሚዛመድ ነገር ሲወጣ፣ እርስዎ ሳይፈልጉ በቴሌግራም መልእክት ይደርስዎታል።",
  alertsPlaceholder: "አይፎን 12 ከ30000 በታች",
  alertsLabel: "ምን እንከታተልልዎ?",
  alertsAction: "ማሳወቂያ ፍጠር",
  alertsSignedOut: "ማሳወቂያ ለማስቀመጥ በቴሌግራም ይግቡ።",
  alertsSaved: "ማሳወቂያው ተቀምጧል። ሲወጣ በቴሌግራም እናሳውቅዎታለን።",
  alertsFailed: "አልተቀመጠም። ከጥቂት ቆይታ በኋላ ይሞክሩ።",

  // ---- provenance ---------------------------------------------------------
  provenanceTitle: "ይህ ከየት ይመጣል",
  provenanceBody1:
    "የተሰበሰበ ማስታወቂያ ሁሉ በይፋዊ የቴሌግራም ቻናል ውስጥ በተለጠፈ ልጥፍ ተጀምሯል። መልእክቱን ማንም ከማንበቡ በፊት እንዳለ እናስቀምጣለን፤ ከዚያ ዋጋ፣ ስልክ ቁጥር፣ ምድብና አካባቢ እናወጣለን፤ የመጣበትንም ቻናል እንጠቅሳለን።",
  provenanceBody2:
    "በእርስዎና በሻጩ መካከል አንገባም። ክፍያ፣ አደራ ወይም ኮሚሽን የለም። ማስታወቂያ ሁሉ ወደ መጀመሪያው ልጥፍ ይመልሳል፤ ግንኙነቱም ሻጩ ወደጻፈው ቁጥር ይሄዳል። ማስታወቂያው የእርስዎ ከሆነና እንዲወጣ ከፈለጉ በአንድ ጠቅታ ይወገዳል።",
  tiersTitle: "ሦስት የማስታወቂያ ዓይነቶች",
  tierIndexedTitle: "ከቴሌግራም ቻናል የተሰበሰበ",
  tierIndexedBody:
    "እዚህ ይፈለጋል፣ ለቻናሉ ይመሰገናል፣ ወደ መጀመሪያው ልጥፍ ይመልሳል። ሻጩ አልተረጋገጠም፤ መለያውም ይህንኑ ይናገራል።",
  tierClaimedTitle: "ሻጩ ቁጥሩ የእሱ መሆኑን አረጋግጧል",
  tierClaimedBody:
    "በልጥፉ ውስጥ ወደነበረው ስልክ ቁጥር ኮድ እንልካለን። ማለፉ የተሰበሰበውን መስመር ማስታወቂያውን ማስተካከል ወደሚችል መዝገብ ይቀይረዋል።",
  tierNativeTitle: "በቀጥታ በጉሊት የተለጠፈ",
  tierNativeBody:
    "የገባ ሻጭ፣ በመተግበሪያው ውስጥ ግንኙነት፣ እና ከተማ አቋርጠው ከመሄድዎ በፊት የሚያነቡት የደረጃ ታሪክ።",
  pipelineTitle: "ልጥፍ እንዴት ማስታወቂያ ይሆናል",
  pipelineListen: "ማዳመጥ",
  pipelineListenBody: "የቴሌቶን ደንበኛ የተፈቀደውን ቻናል ሁሉ ይከታተላል።",
  pipelineStore: "ጥሬውን ማስቀመጥ",
  pipelineStoreBody: "መልእክቶች ማንም ከማንበቡ በፊት እንዳሉ በፖስትግረስ ይቀመጣሉ።",
  pipelineExtract: "ማውጣት",
  pipelineExtractBody: "ዋጋና ስልክ በሬጀክስ፤ ቀሪው በጅምላ።",
  pipelineDedup: "ተደጋጋሚን ማዋሃድ",
  pipelineDedupBody: "ስልክ፣ የፎቶ ሃሽና ጽሑፍ ሁለት ልጥፎች አንድ እቃ መሆናቸውን ይወስናሉ።",
  pipelinePublish: "ማውጣት ወይም ማቆየት",
  pipelinePublishBody: "አጠራጣሪ ውጤቶች ወደ አጣሪ ይሄዳሉ፣ ወደ ገበያው አይወጡም።",

  // ---- sell ---------------------------------------------------------------
  sellTitle: "የማይጠቀሙበትን ይሽጡ",
  sellLede:
    "በቴሌግራም ይግቡ፣ ፎቶዎችዎን ይጨምሩ፤ ከአቻ ሽያጮች የተወሰደ የዋጋ ጥቆማ ይመለስልዎታል። ሁኔታውን ይምረጡ፣ አካባቢዎን ይለጥፉ፣ ያውጡ።",
  sellAction: "እቃ ይሽጡ",
  sellNote: "ገዢዎች አሁን በሚያደርጉት መንገድ በቴሌግራም ወይም በስልክ ያገኙዎታል።",

  // ---- footer -------------------------------------------------------------
  footerBlurb: (channels: string) =>
    `ጉሊት በአዲስ አበባ ካሉ ${channels} የቴሌግራም ቻናሎች የሁለተኛ እጅ ማስታወቂያዎችን ይሰበስባል። ወደ መጀመሪያው ልጥፍ እንመልሳለን፤ ግንኙነቱንም ወደጻፈው ሻጭ እናደርሳለን።`,
  footerBrowse: "ይመልከቱ",
  footerMarketplace: "ገበያ",
  footerTrust: "እምነትና ደህንነት",
  footerBrowseListings: "ማስታወቂያዎችን ይመልከቱ",
  footerNative: "በጉሊት የተለጠፉ",
  footerCrossPosted: "በብዙ ቻናል የተለጠፉ",
  footerHowItWorks: "ጉሊት እንዴት ይሠራል",
  footerMeetingSafely: "ሻጭን በደህና መገናኘት",
  footerScamPatterns: "የማጭበርበር ዘዴዎች",
  footerReport: "ማስታወቂያ ያመልክቱ",
  footerTagline: "ጉሊት — የተሰበሰበ የአደባባይ ገበያ",
  footerRights:
    "የተሰበሰቡ ማስታወቂያዎች የለጠፋቸው ሰው ንብረት ሆነው ይቀጥላሉ። ማስታወቂያው የእርስዎ ከሆነና እንዲወጣ ከፈለጉ በአንድ ጠቅታ ይወገዳል።",

  // ---- empty / degraded ---------------------------------------------------
  freshTitle: "እስካሁን ምንም አልተሰበሰበም።",
  freshLede:
    "ቻናሎቹ ተዘጋጅተዋል፤ ቀጥሎ የሚጀመረው አዳማጩ ነው። የመጀመሪያው ልጥፍ ሲደርስ ፍለጋው ወዲያውኑ ይሠራል።",
  noCaptureYet: "እስካሁን ስብሰባ የለም",
  noPhoto: "ፎቶ የለም",
  priceOnRequest: "ዋጋ በጥያቄ",
}

const TABLE = { en, am } as const

export function strings(lang: Lang): Strings {
  return TABLE[lang]
}

/**
 * "2 days ago" / "ከ2 ቀን በፊት".
 *
 * Hand-rolled rather than Intl.RelativeTimeFormat: the Amharic CLDR forms for
 * short spans are stiff, and this is only ever rendered on the server into
 * static HTML, so there is no client bundle to save by delegating.
 */
export function formatAgo(iso: string, lang: Lang, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))

  if (lang === "am") {
    if (minutes < 2) return "አሁን"
    if (minutes < 60) return `ከ${minutes} ደቂቃ በፊት`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `ከ${hours} ሰዓት በፊት`
    const days = Math.round(hours / 24)
    return `ከ${days} ቀን በፊት`
  }

  if (minutes < 2) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

/** Ingestion is considered stalled past this. The band says so out loud. */
export const STALE_AFTER_HOURS = 24

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 3_600_000
}
