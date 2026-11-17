/**
 * Demo data builder. Runs only when no database exists yet, or when the
 * Super Admin explicitly resets demo data.
 *
 * Order history is generated with a fixed-seed PRNG so it is stable, and all
 * dashboards/reports compute their numbers from these stored records.
 * Demo passwords come from .env — none are hard-coded here.
 */
import { demoEnv } from '@/src/config/env';
import { ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS, normalizePermissions } from '@/src/constants/permissions';
import type {
  Category,
  Database,
  DiningTable,
  Order,
  OrderLine,
  Payment,
  Product,
  Restaurant,
  StaffMember,
  StaffRole,
  TableStatus,
} from '@/src/types/domain';
import { createId, hashPassword, randomToken } from '@/src/utils/crypto';
import { issueQrToken } from '@/src/services/qr/qrService';
import { logActivity } from '@/src/services/audit/activityService';
import { DEMO_FOOD_ASSETS as IMG } from './demoAssets';

const SCHEMA_VERSION = 4;

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProductSeed {
  key: string;
  cat: string;
  title: string;
  description: string;
  price: number;
  image: string;
  popular?: boolean;
  soldOut?: boolean;
  prep?: number;
  variants?: [string, number][];
  addons?: [string, number][];
}

interface StaffSeed {
  name: string;
  username: string;
  email: string;
  role: StaffRole;
  approver?: boolean;
  active?: boolean;
  password: string;
}

interface RestaurantSeed {
  key: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  cuisine: string;
  city: string;
  address: string;
  phone: string;
  accent: string;
  logo: string;
  cover: string;
  status: 'active' | 'suspended';
  approval: boolean;
  serviceCharge: number;
  plan: string;
  credit: number;
  due: string;
  createdDaysAgo: number;
  staff: StaffSeed[];
  categories: { key: string; name: string; description: string; image: string }[];
  products: ProductSeed[];
  tables: { number: string; area: string; capacity: number }[];
  history: { days: number; perDay: [number, number] };
}

const SEEDS: RestaurantSeed[] = [
  {
    key: 'ke',
    name: 'Krunch & Ember',
    slug: 'krunch-ember',
    tagline: 'Hand-breaded crunch, fired to order',
    description: 'Crispy buttermilk chicken, smash beef burgers, loaded fries and family feast boxes — cooked fresh for every order.',
    cuisine: 'Burgers & Fried Chicken',
    city: 'Lahore',
    address: '42-B MM Alam Road, Gulberg III, Lahore',
    phone: '+92 300 412 8890',
    accent: '#E0552B',
    logo: IMG.crispyBurgers,
    cover: IMG.heroFeast,
    status: 'active',
    approval: true,
    serviceCharge: 5,
    plan: 'Growth — one-time licence',
    credit: 45000,
    due: '2027-03-01',
    createdDaysAgo: 120,
    staff: [
      { name: 'Hamza Qureshi', username: demoEnv.restaurantUsername || 'demo.owner', email: 'hamza@krunchember.example', role: 'owner', password: demoEnv.restaurantPassword },
      { name: 'Sana Mahmood', username: 'sana.manager', email: 'sana@krunchember.example', role: 'manager', password: demoEnv.staffPassword },
      { name: 'Bilal Ahmed', username: 'bilal.waiter', email: 'bilal@krunchember.example', role: 'waiter', approver: true, password: demoEnv.staffPassword },
      { name: 'Saad Raza', username: 'saad.waiter', email: 'saad@krunchember.example', role: 'waiter', password: demoEnv.staffPassword },
      { name: 'Tariq Jamil', username: 'tariq.kitchen', email: 'tariq@krunchember.example', role: 'kitchen', password: demoEnv.staffPassword },
      { name: 'Ayesha Siddiqui', username: 'ayesha.cashier', email: 'ayesha@krunchember.example', role: 'cashier', password: demoEnv.staffPassword },
    ],
    categories: [
      { key: 'chicken-burgers', name: 'Chicken Burgers', description: 'Buttermilk-brined fillets on toasted brioche.', image: IMG.crispyBurgers },
      { key: 'beef-burgers', name: 'Beef Burgers', description: 'Double-smashed beef with aged cheddar.', image: IMG.cheesySpecials },
      { key: 'fried-chicken', name: 'Fried Chicken', description: 'Bone-in pieces with house seasoning.', image: IMG.friedChicken },
      { key: 'wings', name: 'Wings & Strips', description: 'Glazed wings and tender strips.', image: IMG.wingsStrips },
      { key: 'fries', name: 'Fries & Sides', description: 'Loaded fries, dips and slaw.', image: IMG.loadedFries },
      { key: 'combos', name: 'Combo Meals', description: 'Main, fries and a chilled drink.', image: IMG.wrapsCombos },
      { key: 'drinks', name: 'Drinks', description: 'Coolers, sodas and shakes.', image: IMG.drinksDesserts },
    ],
    products: [
      { key: 'zinger', cat: 'chicken-burgers', title: 'Ember Crunch Chicken Burger', description: 'Double-dredged chicken thigh, cheddar, iceberg, pickles and chipotle mayo on brioche.', price: 690, image: IMG.crispyBurgers, popular: true, prep: 12, variants: [['Single fillet', 0], ['Double stack', 320]], addons: [['Extra cheese', 100], ['Jalapeños', 60]] },
      { key: 'nashville', cat: 'chicken-burgers', title: 'Nashville Hot Chicken Burger', description: 'Cayenne-glazed fillet, cooling slaw and comeback sauce.', price: 750, image: IMG.crispyBurgers, prep: 12, variants: [['Medium heat', 0], ['Blazing hot', 0]], addons: [['Ranch dip', 80]] },
      { key: 'classic-chicken', cat: 'chicken-burgers', title: 'Classic Chicken Burger', description: 'Crispy fillet, lettuce and house mayo. Simple and honest.', price: 520, image: IMG.crispyBurgers, prep: 10 },
      { key: 'smash', cat: 'beef-burgers', title: 'Double Smash Beef Burger', description: 'Two smashed beef patties, American cheese, onions and burger sauce.', price: 980, image: IMG.cheesySpecials, popular: true, prep: 14, addons: [['Beef bacon', 180], ['Extra patty', 290]] },
      { key: 'mushroom', cat: 'beef-burgers', title: 'Mushroom Swiss Beef Burger', description: 'Beef patty, sautéed mushrooms, Swiss cheese and garlic aioli.', price: 1050, image: IMG.cheesySpecials, prep: 14 },
      { key: 'bucket4', cat: 'fried-chicken', title: '4-Piece Fried Chicken', description: 'Golden bone-in pieces with a dinner roll and garlic dip.', price: 1150, image: IMG.friedChicken, popular: true, prep: 15, variants: [['Original', 0], ['Spicy masala', 60]] },
      { key: 'snackbox', cat: 'fried-chicken', title: '2-Piece Chicken Meal', description: 'Two pieces, fries and coleslaw.', price: 780, image: IMG.friedChicken, prep: 12 },
      { key: 'wings', cat: 'wings', title: 'Honey Chili Wings (8 pcs)', description: 'Crispy wings tossed in sticky honey-chili glaze.', price: 890, image: IMG.wingsStrips, popular: true, prep: 12, variants: [['8 pieces', 0], ['16 pieces', 760]], addons: [['Blue cheese dip', 120]] },
      { key: 'strips', cat: 'wings', title: 'Crispy Tender Strips (5 pcs)', description: 'Hand-cut strips with honey mustard.', price: 820, image: IMG.wingsStrips, prep: 10 },
      { key: 'loaded', cat: 'fries', title: 'Loaded Cheesy Chicken Fries', description: 'Fries, chicken bites, cheese sauce and jalapeños.', price: 790, image: IMG.loadedFries, popular: true, prep: 8 },
      { key: 'fries', cat: 'fries', title: 'Cajun Fries', description: 'Crinkle-cut fries with cajun seasoning.', price: 350, image: IMG.loadedFries, prep: 6, variants: [['Regular', 0], ['Large', 120]] },
      { key: 'ribs', cat: 'fries', title: 'Smoky BBQ Ribs Platter', description: 'Slow-cooked ribs. Currently unavailable.', price: 2200, image: IMG.heroFeast, soldOut: true, prep: 25 },
      { key: 'combo', cat: 'combos', title: 'Krunch Burger Combo', description: 'Ember Crunch burger, regular fries and a soft drink.', price: 1090, image: IMG.wrapsCombos, popular: true, prep: 12 },
      { key: 'family', cat: 'combos', title: 'Family Feast Box (serves 4)', description: '8 pieces of chicken, 4 burgers, 2 large fries and 1.5L drink.', price: 4890, image: IMG.heroFeast, prep: 20 },
      { key: 'fizz', cat: 'drinks', title: 'Wild Berry Mint Fizz', description: 'Mixed berries, mint and soda.', price: 420, image: IMG.drinksDesserts, prep: 3 },
      { key: 'cola', cat: 'drinks', title: 'Iced Cola', description: 'Chilled soft drink.', price: 190, image: IMG.drinksDesserts, prep: 1, variants: [['350 ml', 0], ['500 ml', 70]] },
    ],
    tables: [
      { number: '01', area: 'Main hall', capacity: 4 },
      { number: '02', area: 'Main hall', capacity: 4 },
      { number: '03', area: 'Main hall', capacity: 2 },
      { number: '04', area: 'Main hall', capacity: 6 },
      { number: '05', area: 'Terrace', capacity: 4 },
      { number: '06', area: 'Terrace', capacity: 2 },
      { number: '07', area: 'Family room', capacity: 8 },
      { number: '08', area: 'Family room', capacity: 6 },
    ],
    history: { days: 21, perDay: [3, 7] },
  },
  {
    key: 'sc',
    name: 'Saffron & Clay',
    slug: 'saffron-clay',
    tagline: 'Charcoal grill, warm hospitality',
    description: 'Charcoal-grilled wraps, platters and toasted sandwiches with fresh coolers in a relaxed neighbourhood dining room.',
    cuisine: 'Grill & Wraps',
    city: 'Karachi',
    address: 'Plot 14, Clifton Block 4, Karachi',
    phone: '+92 321 998 1140',
    accent: '#B7791F',
    logo: IMG.wrapsCombos,
    cover: IMG.friedChicken,
    status: 'active',
    approval: false,
    serviceCharge: 0,
    plan: 'Starter — one-time licence',
    credit: 18500,
    due: '2027-01-15',
    createdDaysAgo: 75,
    staff: [
      { name: 'Zainab Tariq', username: 'zainab.owner', email: 'zainab@saffronclay.example', role: 'owner', password: demoEnv.staffPassword },
      { name: 'Kamran Ali', username: 'kamran.kitchen', email: 'kamran@saffronclay.example', role: 'kitchen', password: demoEnv.staffPassword },
      { name: 'Hina Shah', username: 'hina.cashier', email: 'hina@saffronclay.example', role: 'cashier', password: demoEnv.staffPassword },
    ],
    categories: [
      { key: 'wraps', name: 'Signature Wraps', description: 'Charcoal-grilled, rolled to order.', image: IMG.wrapsCombos },
      { key: 'platters', name: 'Grill Platters', description: 'Herb-crusted platters with sauces.', image: IMG.friedChicken },
      { key: 'sandwiches', name: 'Sandwiches', description: 'Toasted sourdough and ciabatta.', image: IMG.cheesySpecials },
      { key: 'coolers', name: 'Craft Coolers', description: 'Fresh mint, berry and citrus.', image: IMG.drinksDesserts },
    ],
    products: [
      { key: 'garlic-wrap', cat: 'wraps', title: 'Saffron Garlic Chicken Wrap', description: 'Grilled chicken, toum, pickles and fries rolled in saj bread.', price: 640, image: IMG.wrapsCombos, popular: true, prep: 9, addons: [['Extra toum', 70]] },
      { key: 'crispy-wrap', cat: 'wraps', title: 'Crispy Twister Wrap', description: 'Crispy strips, lettuce and pepper mayo.', price: 590, image: IMG.wrapsCombos, prep: 8 },
      { key: 'platter', cat: 'platters', title: 'Herb-Crusted Chicken Platter', description: 'Half chicken, rice, grilled vegetables and two sauces.', price: 1450, image: IMG.friedChicken, popular: true, prep: 18 },
      { key: 'mixed', cat: 'platters', title: 'Mixed Grill for Two', description: 'Chicken tikka, seekh kebab, wings and naan.', price: 2650, image: IMG.heroFeast, prep: 22 },
      { key: 'club', cat: 'sandwiches', title: 'Grilled Chicken Club Sandwich', description: 'Triple-decker with egg, cheese and fries.', price: 720, image: IMG.cheesySpecials, prep: 10 },
      { key: 'steak-sub', cat: 'sandwiches', title: 'Beef Steak Sandwich', description: 'Sliced steak, caramelised onions and provolone on ciabatta.', price: 1150, image: IMG.cheesySpecials, popular: true, prep: 12 },
      { key: 'mint', cat: 'coolers', title: 'Pomegranate Mint Cooler', description: 'Pomegranate, lime and crushed mint.', price: 380, image: IMG.drinksDesserts, prep: 3 },
      { key: 'lemonade', cat: 'coolers', title: 'Mint Lemonade', description: 'Freshly squeezed and blended with mint.', price: 320, image: IMG.drinksDesserts, prep: 3 },
    ],
    tables: [
      { number: '01', area: 'Dining room', capacity: 4 },
      { number: '02', area: 'Dining room', capacity: 4 },
      { number: '03', area: 'Dining room', capacity: 2 },
      { number: '04', area: 'Courtyard', capacity: 6 },
      { number: '05', area: 'Courtyard', capacity: 4 },
      { number: '06', area: 'Courtyard', capacity: 2 },
    ],
    history: { days: 21, perDay: [2, 5] },
  },
  {
    key: 'fn',
    name: 'Forno Ninety',
    slug: 'forno-ninety',
    tagline: 'Stone-baked in ninety seconds',
    description: 'Wood-fired pizzas, hot sandwiches and house sodas, baked fast and served hot.',
    cuisine: 'Pizza & Sandwiches',
    city: 'Islamabad',
    address: 'Kohsar Market, F-6/3, Islamabad',
    phone: '+92 333 510 2290',
    accent: '#C2412D',
    logo: '',
    cover: IMG.cheesySpecials,
    status: 'active',
    approval: false,
    serviceCharge: 8,
    plan: 'Growth — one-time licence',
    credit: 32000,
    due: '2027-05-20',
    createdDaysAgo: 40,
    staff: [
      { name: 'Omar Farooq', username: 'omar.owner', email: 'omar@fornoninety.example', role: 'owner', password: demoEnv.staffPassword },
      { name: 'Nida Khan', username: 'nida.manager', email: 'nida@fornoninety.example', role: 'manager', password: demoEnv.staffPassword },
      { name: 'Usman Iqbal', username: 'usman.kitchen', email: 'usman@fornoninety.example', role: 'kitchen', password: demoEnv.staffPassword },
    ],
    categories: [
      { key: 'pizza', name: 'Pizza', description: '12" wood-fired, hand-stretched dough.', image: '' },
      { key: 'sandwiches', name: 'Hot Sandwiches', description: 'Pressed and toasted to order.', image: IMG.cheesySpecials },
      { key: 'sides', name: 'Sides', description: 'Wedges, wings and garlic bread.', image: IMG.loadedFries },
      { key: 'drinks', name: 'Drinks', description: 'House sodas and iced tea.', image: IMG.drinksDesserts },
    ],
    products: [
      { key: 'margherita', cat: 'pizza', title: 'Margherita Pizza', description: 'San Marzano tomato, fior di latte and basil.', price: 1290, image: '', popular: true, prep: 8, variants: [['12 inch', 0], ['16 inch', 650]] },
      { key: 'pepperoni', cat: 'pizza', title: 'Beef Pepperoni Pizza', description: 'Beef pepperoni, mozzarella and chilli honey.', price: 1590, image: '', popular: true, prep: 8, variants: [['12 inch', 0], ['16 inch', 700]] },
      { key: 'tikka', cat: 'pizza', title: 'Chicken Tikka Pizza', description: 'Tikka chicken, onions, green chilli and mint drizzle.', price: 1490, image: '', prep: 8, variants: [['12 inch', 0], ['16 inch', 700]] },
      { key: 'panini', cat: 'sandwiches', title: 'Chicken Pesto Panini', description: 'Grilled chicken, pesto, mozzarella and roasted peppers.', price: 890, image: IMG.cheesySpecials, prep: 7 },
      { key: 'philly', cat: 'sandwiches', title: 'Beef Philly Sandwich', description: 'Shaved beef, peppers, onions and cheese sauce.', price: 1150, image: IMG.cheesySpecials, popular: true, prep: 8 },
      { key: 'wedges', cat: 'sides', title: 'Spiced Potato Wedges', description: 'With garlic aioli.', price: 420, image: IMG.loadedFries, prep: 6 },
      { key: 'wings', cat: 'sides', title: 'Oven Wings (6 pcs)', description: 'Lemon pepper or buffalo.', price: 760, image: IMG.wingsStrips, prep: 10 },
      { key: 'soda', cat: 'drinks', title: 'House Lemon Soda', description: 'Fresh lemon, soda and a pinch of salt.', price: 280, image: IMG.drinksDesserts, prep: 2 },
    ],
    tables: [
      { number: '01', area: 'Counter', capacity: 2 },
      { number: '02', area: 'Counter', capacity: 2 },
      { number: '03', area: 'Main floor', capacity: 4 },
      { number: '04', area: 'Main floor', capacity: 4 },
      { number: '05', area: 'Main floor', capacity: 6 },
    ],
    history: { days: 14, perDay: [2, 5] },
  },
  {
    key: 'hg',
    name: 'Harbor Grill House',
    slug: 'harbor-grill',
    tagline: 'Coastal grill & seafood',
    description: 'Grilled seafood and steaks. Account currently suspended pending renewal.',
    cuisine: 'Seafood & Steak',
    city: 'Karachi',
    address: 'Do Darya, Phase 8, DHA, Karachi',
    phone: '+92 300 220 4411',
    accent: '#2B6CB0',
    logo: '',
    cover: IMG.heroFeast,
    status: 'suspended',
    approval: false,
    serviceCharge: 10,
    plan: 'Starter — one-time licence',
    credit: 0,
    due: '2026-10-01',
    createdDaysAgo: 160,
    staff: [
      { name: 'Faisal Mirza', username: 'faisal.owner', email: 'faisal@harborgrill.example', role: 'owner', password: demoEnv.staffPassword },
    ],
    categories: [{ key: 'grill', name: 'From the Grill', description: 'Steaks and seafood.', image: IMG.heroFeast }],
    products: [
      { key: 'fish', cat: 'grill', title: 'Grilled Fish Fillet', description: 'Lemon butter, mash and greens.', price: 1850, image: IMG.heroFeast, prep: 15 },
    ],
    tables: [
      { number: '01', area: 'Deck', capacity: 4 },
      { number: '02', area: 'Deck', capacity: 4 },
    ],
    history: { days: 0, perDay: [0, 0] },
  },
];

function prefixOf(name: string): string {
  return name
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export function buildSeedDatabase(now = new Date()): Database {
  const nowIso = now.toISOString();
  const db: Database = {
    schemaVersion: SCHEMA_VERSION,
    seededAt: nowIso,
    restaurants: [],
    staff: [],
    categories: [],
    products: [],
    tables: [],
    qrRegistry: [],
    orders: [],
    payments: [],
    activity: [],
  };
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const platformActor = { id: 'platform-super-admin', name: 'Platform Administrator', role: 'Super Admin' };

  SEEDS.forEach((seed, seedIndex) => {
    const businessId = `biz_${seed.key}_${randomToken().slice(0, 8)}`;
    const restaurantId = `rest_${seed.key}_${randomToken().slice(0, 8)}`;
    const scope = { businessId, restaurantId };
    const created = daysAgo(seed.createdDaysAgo);

    const restaurant: Restaurant = {
      id: restaurantId,
      businessId,
      slug: seed.slug,
      name: seed.name,
      tagline: seed.tagline,
      description: seed.description,
      cuisine: seed.cuisine,
      ownerName: seed.staff[0].name,
      ownerEmail: seed.staff[0].email,
      phone: seed.phone,
      address: seed.address,
      city: seed.city,
      logoImage: seed.logo,
      coverImage: seed.cover,
      accentColor: seed.accent,
      status: seed.status,
      commercial: { planLabel: seed.plan, creditBalance: seed.credit, dueDate: seed.due },
      settings: {
        requireWaiterApproval: seed.approval,
        serviceChargePercent: seed.serviceCharge,
        showSoldOutItems: true,
        currency: 'PKR',
        receiptFooter: 'Thank you for dining with us!',
      },
      createdAt: created,
      updatedAt: daysAgo(1),
    };
    db.restaurants.push(restaurant);
    logActivity(db, { businessId: 'platform', restaurantId: 'platform' }, platformActor, {
      category: 'tenant',
      action: 'Restaurant created',
      targetId: restaurantId,
      targetLabel: seed.name,
      details: `Provisioned ${seed.name} (${seed.city}).`,
    }, created);

    const staff: StaffMember[] = seed.staff.map((s) => {
      const salt = randomToken().slice(0, 16);
      const perms = s.role === 'waiter' && s.approver ? [...ROLE_DEFAULT_PERMISSIONS.waiter, 'orders.approve'] : ROLE_DEFAULT_PERMISSIONS[s.role];
      return {
        id: createId('staff'),
        businessId,
        restaurantId,
        name: s.name,
        username: s.username.toLowerCase(),
        email: s.email,
        phone: '',
        role: s.role,
        isActive: s.active ?? true,
        passwordSalt: salt,
        passwordHash: s.password ? hashPassword(s.password, salt) : '',
        permissions: normalizePermissions(s.role, perms),
        createdAt: created,
        updatedAt: created,
      };
    });
    db.staff.push(...staff);

    const catIds = new Map<string, string>();
    seed.categories.forEach((c, i) => {
      const cat: Category = {
        id: createId('cat'),
        ...scope,
        name: c.name,
        description: c.description,
        image: c.image,
        sortOrder: i + 1,
        isActive: true,
        createdAt: created,
        updatedAt: created,
      };
      catIds.set(c.key, cat.id);
      db.categories.push(cat);
    });

    const products: Product[] = seed.products.map((p) => ({
      id: createId('prod'),
      ...scope,
      categoryId: catIds.get(p.cat)!,
      title: p.title,
      description: p.description,
      price: p.price,
      image: p.image,
      isAvailable: !p.soldOut,
      isPopular: Boolean(p.popular),
      prepMinutes: p.prep ?? 10,
      variants: (p.variants ?? []).map(([name, price]) => ({ id: createId('var'), name, price })),
      addons: (p.addons ?? []).map(([name, price]) => ({ id: createId('add'), name, price })),
      createdAt: created,
      updatedAt: created,
    }));
    db.products.push(...products);

    const tables: DiningTable[] = seed.tables.map((t) => {
      const table: DiningTable = {
        id: createId('tbl'),
        ...scope,
        number: t.number,
        label: `Table ${t.number}`,
        area: t.area,
        capacity: t.capacity,
        status: 'available',
        statusChangedAt: daysAgo(1),
        qrToken: '',
        qrVersion: 1,
        createdAt: created,
        updatedAt: created,
      };
      table.qrToken = issueQrToken(db, table, randomToken, created).token;
      return table;
    });
    db.tables.push(...tables);

    // ------------------------------ orders ------------------------------
    if (seed.status !== 'active') return;
    const rand = prng(9001 + seedIndex * 97);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
    const orderable = products.filter((p) => p.isAvailable);
    const prefix = prefixOf(seed.name);
    let orderSeq = 1001;
    let receiptSeq = 5001;
    const cashier = staff.find((s) => s.role === 'cashier') ?? staff[0];
    const approver = staff.find((s) => s.role === 'waiter' && s.permissions.includes('orders.approve'));
    const chef = staff.find((s) => s.role === 'kitchen') ?? staff[0];
    const waiter = staff.find((s) => s.role === 'waiter') ?? staff[0];

    const makeLines = (): OrderLine[] => {
      const count = 1 + Math.floor(rand() * 3);
      const chosen = new Set<Product>();
      while (chosen.size < count) chosen.add(pick(orderable));
      return [...chosen].map((p) => {
        const variant = p.variants.length && rand() > 0.6 ? pick(p.variants) : undefined;
        const addon = p.addons.length && rand() > 0.7 ? [pick(p.addons)] : [];
        const unit = p.price + (variant?.price ?? 0) + addon.reduce((s, a) => s + a.price, 0);
        const qty = rand() > 0.75 ? 2 : 1;
        return {
          id: createId('line'),
          productId: p.id,
          title: p.title,
          image: p.image,
          basePrice: p.price,
          variant: variant ? { name: variant.name, price: variant.price } : undefined,
          addons: addon.map((a) => ({ name: a.name, price: a.price })),
          unitPrice: unit,
          quantity: qty,
          lineTotal: unit * qty,
        };
      });
    };

    type Kind = 'qr' | 'pos-dine' | 'pos-takeaway';
    const makeOrder = (table: DiningTable | null, at: Date, status: Order['status'], kind: Kind = 'qr'): Order => {
      const lines = makeLines();
      const pos = kind !== 'qr';
      const takeaway = kind === 'pos-takeaway' || !table;
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      // Service charge applies to table service only (same rule as the POS service).
      const serviceCharge = takeaway ? 0 : Math.round((subtotal * seed.serviceCharge) / 100);
      const needsApproval = !pos && seed.approval;
      const iso = at.toISOString();
      const order: Order = {
        id: createId('ord'),
        ...scope,
        number: `${prefix}-${orderSeq++}`,
        source: pos ? 'pos' : 'qr',
        type: takeaway ? 'takeaway' : 'dine_in',
        tableId: takeaway ? null : table!.id,
        tableNumber: takeaway ? '' : table!.number,
        tableLabel: takeaway ? 'Takeaway' : table!.label,
        qrToken: pos || takeaway ? '' : table!.qrToken,
        createdBy: pos ? { id: cashier.id, name: cashier.name } : undefined,
        clientRequestId: randomToken(),
        lines,
        subtotal,
        serviceCharge,
        total: subtotal + serviceCharge,
        status,
        approvalRequired: needsApproval,
        paymentMethod: 'cash_at_counter',
        paymentStatus: 'unpaid',
        history: [
          pos
            ? {
                status: 'new',
                label: `Created at POS (${takeaway ? 'takeaway' : table!.label}) — sent to kitchen`,
                actorName: cashier.name,
                actorRole: ROLE_LABELS[cashier.role],
                at: iso,
              }
            : {
                status: needsApproval ? 'pending_approval' : 'new',
                label: needsApproval ? 'Submitted — awaiting waiter approval' : 'Submitted — sent to kitchen',
                actorName: `${table!.label} guest`,
                actorRole: 'Customer',
                at: iso,
              },
        ],
        createdAt: iso,
        updatedAt: iso,
      };
      const step = (s: Order['status'], label: string, by: StaffMember, mins: number) => {
        const t = new Date(at.getTime() + mins * 60000).toISOString();
        order.history.push({ status: s, label, actorName: by.name, actorRole: ROLE_LABELS[by.role], at: t });
        order.updatedAt = t;
        return t;
      };
      const flow: Order['status'][] = ['new', 'preparing', 'ready', 'completed', 'served'];
      const target = flow.indexOf(status);
      if (needsApproval && status !== 'pending_approval' && approver) {
        const t = step('new', 'Approved — sent to kitchen', approver, 2);
        order.approvedBy = { id: approver.id, name: approver.name, at: t };
      }
      if (target >= 1) step('preparing', 'Accepted — preparing', chef, 4);
      if (target >= 2) step('ready', 'Ready at the pass', chef, 16);
      if (target >= 3) step('completed', 'Completed by kitchen', chef, 18);
      if (target >= 4) step('served', takeaway ? 'Handed to customer' : 'Served to table', takeaway ? cashier : waiter, 21);
      return order;
    };

    const pay = (orders: Order[], at: Date, billType: Payment['billType']) => {
      const totalDue = orders.reduce((s, o) => s + o.total, 0);
      const amountReceived = Math.ceil(totalDue / 500) * 500 + (rand() > 0.5 ? 500 : 0);
      const iso = at.toISOString();
      const payment: Payment = {
        id: createId('pay'),
        ...scope,
        receiptNumber: `RC-${prefix}-${receiptSeq++}`,
        billType,
        orderType: orders[0].type,
        tableId: orders[0].tableId,
        tableLabel: orders[0].tableLabel,
        orderIds: orders.map((o) => o.id),
        orderNumbers: orders.map((o) => o.number),
        lines: orders.flatMap((o) => o.lines.map((l) => ({ title: l.title, quantity: l.quantity, lineTotal: l.lineTotal }))),
        subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
        serviceCharge: orders.reduce((s, o) => s + o.serviceCharge, 0),
        totalDue,
        amountReceived,
        changeDue: amountReceived - totalDue,
        method: 'cash_at_counter',
        cashier: { id: cashier.id, name: cashier.name },
        reprintCount: 0,
        paidAt: iso,
      };
      orders.forEach((o) => {
        o.paymentStatus = 'paid';
        o.paymentId = payment.id;
        o.history.push({ status: 'paid', label: `Paid — cash at counter (${payment.receiptNumber})`, actorName: cashier.name, actorRole: ROLE_LABELS[cashier.role], at: iso });
      });
      db.payments.push(payment);
      logActivity(db, scope, { id: cashier.id, name: cashier.name, role: ROLE_LABELS[cashier.role] }, {
        category: 'payment',
        action: 'Cash payment recorded',
        targetId: payment.id,
        targetLabel: payment.receiptNumber,
        details: `${payment.orderNumbers.join(', ')} — due ${totalDue}, received ${amountReceived}, change ${payment.changeDue}.`,
      }, iso);
    };

    const history: Order[] = [];
    for (let d = seed.history.days; d >= 1; d--) {
      const [min, max] = seed.history.perDay;
      const count = min + Math.floor(rand() * (max - min + 1));
      for (let i = 0; i < count; i++) {
        const at = new Date(now);
        at.setDate(at.getDate() - d);
        at.setHours(12 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
        const table = pick(tables);
        const isRejected = rand() < 0.04;
        const channel = rand();
        const kind: Kind = channel < 0.12 ? 'pos-takeaway' : channel < 0.2 ? 'pos-dine' : 'qr';
        const order = makeOrder(kind === 'pos-takeaway' ? null : table, at, isRejected ? 'rejected' : 'served', kind);
        if (isRejected) {
          const t = new Date(at.getTime() + 5 * 60000).toISOString();
          order.rejection = { stage: 'kitchen', reason: 'Item ran out during service', byName: chef.name, at: t };
          order.history.push({ status: 'rejected', label: 'Rejected by kitchen', actorName: chef.name, actorRole: ROLE_LABELS[chef.role], at: t, note: order.rejection.reason });
        } else {
          pay([order], new Date(at.getTime() + 45 * 60000), 'individual');
        }
        history.push(order);
      }
    }

    // Today: a realistic live service snapshot.
    const today = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000);
    // [table index (-1 = takeaway), status, minutes ago, channel]
    const live: Array<[number, Order['status'], number, Kind?]> =
      seed.key === 'ke'
        ? [
            [0, 'served', 190],
            [1, 'served', 150],
            [2, 'completed', 34],
            [2, 'ready', 22],
            [3, 'preparing', 12],
            [4, 'new', 6],
            [6, 'pending_approval', 3],
            [6, 'pending_approval', 1],
            [-1, 'preparing', 7, 'pos-takeaway'],
            [-1, 'completed', 16, 'pos-takeaway'],
          ]
        : seed.key === 'sc'
          ? [
              [0, 'served', 120],
              [1, 'preparing', 9],
              [3, 'new', 4],
            ]
          : [
              [0, 'served', 80],
              [2, 'ready', 15],
            ];
    const occupied = new Set<number>();
    live.forEach(([tableIdx, status, minsAgo, kind], i) => {
      const table = tableIdx >= 0 ? tables[tableIdx] : null;
      const order = makeOrder(table, today(minsAgo), status, kind ?? 'qr');
      if (status === 'served' && i < 2) pay([order], today(Math.max(1, minsAgo - 60)), 'individual');
      if (status !== 'served' && tableIdx >= 0) occupied.add(tableIdx);
      history.push(order);
    });

    const setStatus = (idx: number, status: TableStatus, minsAgo: number) => {
      if (!tables[idx]) return;
      tables[idx].status = status;
      tables[idx].statusChangedAt = today(minsAgo).toISOString();
    };
    occupied.forEach((idx) => setStatus(idx, 'occupied', 40));
    if (seed.key === 'ke') setStatus(5, 'cleaning', 5);

    // Newest first, then keep running sequence numbers.
    history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    db.orders.push(...history);
  });

  db.payments.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  db.activity.sort((a, b) => b.at.localeCompare(a.at));
  return db;
}
