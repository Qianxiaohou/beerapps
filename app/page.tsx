'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  ShoppingBag, Plus, Minus, Package, ClipboardList, Wallet, 
  CheckCircle, ChevronLeft, Play, LogOut, Trash2, X, Check, 
  Image as ImageIcon, Settings, Upload, UserPlus, EyeOff, Edit3, 
  Save, ChevronDown, ChevronUp, FileText, Search, RefreshCw, Smartphone,
  ShieldCheck, Power, AlertCircle, Download, UploadCloud
} from 'lucide-react';

// ==========================================
// 🚀 你的云端配置 (已自动填入)
// ==========================================
const SUPABASE_URL = 'https://xvphelpqjlefckvvbict.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cGhlbHBxamxlZmNrdnZiaWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NTE5MjIsImV4cCI6MjA4MzQyNzkyMn0.WFQvG9lZasfyR6BxFxZUMF5qz4cqjdzlB-H4jS2Dehk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 1. 類型定義
// ==========================================

type ViewState = 'WELCOME' | 'USER_MENU' | 'ORDER_SUMMARY' | 'SHOP' | 'CART_CONFIRM' | 'SUCCESS' | 'ADMIN_DASHBOARD';
type AdminTab = 'ORDERS' | 'PRODUCTS' | 'PURCHASE' | 'FINANCE' | 'ADS' | 'SETTINGS';
type BannerType = 'WELCOME' | 'SHOP';

interface Product {
  id: number;
  sku: string;        
  name: string;       
  desc: string;       
  price: number;      
  msrp: number;       // 原價
  cost: number;       
  stockTotal: number; 
  image: string;      
  isActive: boolean;  
}

interface OrderItem {
  productId: number;
  name: string;       
  count: number;
  snapshotPrice: number;
  snapshotCost: number;
  image?: string;    
}

interface Order {
  id: number;           
  displayId: string;    
  clientName: string;   
  clientId: string;     
  items: OrderItem[];
  totalPrice: number;
  status: 'PENDING' | 'CONFIRMED';
  paymentStatus: 'UNPAID' | 'PAID';    
  isClosed: boolean;                  
  timestamp: number;    
  dateStr: string;      
}

interface Banner {
  id: number;
  type: BannerType;
  image: string;
  title: string;
  subtitle: string;
}

// 初始 Banner (防空用)
const INITIAL_BANNERS: Banner[] = [
  { id: 1, type: 'WELCOME', image: 'https://i.postimg.cc/509DMS30/网页1.jpg', title: '', subtitle: '' },
];

export default function App() {
  // --- 全局狀態 ---
  const [isLoaded, setIsLoaded] = useState(false);
  const [view, setView] = useState<ViewState>('WELCOME');
  const [isPreviewMode, setIsPreviewMode] = useState(false); 
  
  // 截單狀態 (现在从数据库读取)
  const [isShopOpen, setIsShopOpen] = useState(true);

  const [currentUser, setCurrentUser] = useState({ name: '', id: '' });
  const [inputLineId, setInputLineId] = useState('');
  const [inputLineName, setInputLineName] = useState('');
  
  // 管理员密码保留在本地比较简单
  const [adminCreds, setAdminCreds] = useState({ username: 'vulu8jp', password: 'tp6u83jp6' });

  // --- 核心數據 (Supabase) ---
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeBanners, setActiveBanners] = useState<Banner[]>(INITIAL_BANNERS);
  const [draftBanners, setDraftBanners] = useState<Banner[]>(INITIAL_BANNERS);
  
  // 本地临时状态
  const [cart, setCart] = useState<{[key: number]: number}>({});
  const [actualAcquired, setActualAcquired] = useState<{[key: string]: number}>({});

  // --- 搜索與 UI 狀態 ---
  const [shopSearch, setShopSearch] = useState('');
  const [adminOrderSearch, setAdminOrderSearch] = useState('');
  const [adminProductSearch, setAdminProductSearch] = useState('');
  const [adminPurchaseSearch, setAdminPurchaseSearch] = useState('');
  
  const [adminTab, setAdminTab] = useState<AdminTab>('ORDERS');
  const [currentWelcomeBanner, setCurrentWelcomeBanner] = useState(0);
  const [currentShopBanner, setCurrentShopBanner] = useState(0);
  
  const [expandedClientKey, setExpandedClientKey] = useState<string | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null); 
  const [tempProductData, setTempProductData] = useState<Product | null>(null);

  // --- 管理員設置狀態 ---
  const [newCreds, setNewCreds] = useState({ name: '', nameConfirm: '', pass: '', passConfirm: '' });

  // --- 彈窗控制 ---
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [showAppendItemModal, setShowAppendItemModal] = useState(false);
  const [targetAppendOrderId, setTargetAppendOrderId] = useState<number | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [orderForm, setOrderForm] = useState({ name: '', id: '', items: [] as OrderItem[] });

  // ==========================================
  // 3. 輔助函數
  // ==========================================
  const formatNT = (amt: number) => `NT$ ${amt.toLocaleString()}`;
  const recalculateTotal = (items: OrderItem[]) => items.reduce((sum, item) => sum + (item.snapshotPrice * item.count), 0);
  
  const mergeOrderItems = (existingItems: OrderItem[], newItems: OrderItem[]) => {
    const merged = [...existingItems];
    newItems.forEach(newItem => {
      const existingIndex = merged.findIndex(i => i.productId === newItem.productId);
      if (existingIndex >= 0) { merged[existingIndex].count += newItem.count; } 
      else { merged.push(newItem); }
    });
    return merged;
  };

  const getAggregatedItems = (items: OrderItem[]) => {
    const map = new Map<number, OrderItem>();
    items.forEach(item => {
      if (map.has(item.productId)) { map.get(item.productId)!.count += item.count; } 
      else { map.set(item.productId, { ...item }); }
    });
    return Array.from(map.values());
  };

  // ==========================================
  // 4. Supabase 数据交互 (云端)
  // ==========================================

  // 初始化加载所有数据
  const fetchAllData = async () => {
    // 1. 获取商品
    const { data: pData } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (pData) {
      const formatted: Product[] = pData.map(p => ({
        id: p.id, sku: p.sku || '', name: p.name, desc: p.desc || '',
        price: p.price, msrp: p.msrp || 0, cost: p.cost, stockTotal: p.stock_total,
        image: p.image, isActive: p.is_active
      }));
      setProducts(formatted);
    }

    // 2. 获取订单
    const { data: oData } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (oData) {
      const formatted: Order[] = oData.map(o => ({
        id: o.id, displayId: o.display_id, clientName: o.client_name, clientId: o.client_id,
        items: o.items, totalPrice: o.total_price, status: o.status as any,
        paymentStatus: o.payment_status as any, isClosed: o.is_closed,
        timestamp: o.timestamp, dateStr: o.date_str
      }));
      setOrders(formatted);
    }

    // 3. 获取广告
    const { data: bData } = await supabase.from('banners').select('*');
    if (bData && bData.length > 0) {
      setActiveBanners(bData);
      setDraftBanners(bData);
    }

    // 4. 获取全局设置 (是否截单)
    const { data: sData } = await supabase.from('app_settings').select('*').eq('key', 'shop_status').single();
    if (sData && sData.value) {
        setIsShopOpen(sData.value.isOpen);
    }

    // 5. 简单的本地缓存读取 (非关键数据)
    const savedAcquired = localStorage.getItem('actualAcquired');
    const savedCreds = localStorage.getItem('adminCreds');
    if (savedAcquired) setActualAcquired(JSON.parse(savedAcquired));
    if (savedCreds) {
        const parsedCreds = JSON.parse(savedCreds);
        setAdminCreds(parsedCreds);
        setNewCreds({ name: parsedCreds.username, nameConfirm: parsedCreds.username, pass: parsedCreds.password, passConfirm: parsedCreds.password });
    } else {
        setNewCreds({ name: adminCreds.username, nameConfirm: adminCreds.username, pass: adminCreds.password, passConfirm: adminCreds.password });
    }

    setIsLoaded(true);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 监听本地变化写入LocalStorage (仅非关键配置)
  useEffect(() => { if(isLoaded) {
    localStorage.setItem('actualAcquired', JSON.stringify(actualAcquired));
    localStorage.setItem('adminCreds', JSON.stringify(adminCreds));
  }}, [actualAcquired, adminCreds, isLoaded]);

  // 轮播
  useEffect(() => {
    const timer = setInterval(() => {
      const welcomeBanners = activeBanners.filter(b => b.type === 'WELCOME');
      const shopBanners = activeBanners.filter(b => b.type === 'SHOP');
      if (welcomeBanners.length > 0) setCurrentWelcomeBanner(prev => (prev + 1) % welcomeBanners.length);
      if (shopBanners.length > 0) setCurrentShopBanner(prev => (prev + 1) % shopBanners.length);
    }, 5000); 
    return () => clearInterval(timer);
  }, [activeBanners]);

  // ==========================================
  // 5. 写操作 (Write Actions)
  // ==========================================

  // 切换商店营业状态 (写数据库)
  const toggleShopStatus = async () => {
      const newStatus = !isShopOpen;
      setIsShopOpen(newStatus); // 乐观更新
      await supabase.from('app_settings').upsert({ key: 'shop_status', value: { isOpen: newStatus } }, { onConflict: 'key' });
  };

  // 商品: 新增/更新
  const saveProductToDB = async (prod: Product) => {
    const dbPayload = {
      name: prod.name, sku: prod.sku, "desc": prod.desc,
      price: prod.price, msrp: prod.msrp, cost: prod.cost,
      stock_total: prod.stockTotal, image: prod.image, is_active: prod.isActive
    };
    if (prod.id > 1700000000000) { // 简单判断是临时ID (时间戳)
       await supabase.from('products').insert(dbPayload);
    } else {
       await supabase.from('products').update(dbPayload).eq('id', prod.id);
    }
    fetchAllData();
  };

  const deleteProductFromDB = async (id: number) => {
    await supabase.from('products').delete().eq('id', id);
    fetchAllData();
  };

  // 订单: 提交
  const handleSubmitNewOrder = async () => {
    if (Object.keys(cart).length === 0) return;
    if (!isShopOpen && !isPreviewMode) { alert('抱歉，目前商店已截單。'); return; }
    if (isPreviewMode) { alert('【預覽模式】模擬成功！'); setCart({}); setView('SHOP'); return; }

    const items: OrderItem[] = Object.entries(cart).map(([pid, count]) => {
      const p = products.find(prod => prod.id === Number(pid));
      return { 
        productId: Number(pid), name: p ? p.name : '未知商品', count, 
        snapshotPrice: p ? p.price : 0, snapshotCost: p ? p.cost : 0, image: p?.image 
      };
    });
    
    const total = recalculateTotal(items);
    const dateStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute:'2-digit' });
    const timestamp = Date.now();
    const displayId = `#${String(orders.length + 1).padStart(3, '0')}`;

    const { error } = await supabase.from('orders').insert({
       display_id: displayId,
       client_name: currentUser.name,
       client_id: currentUser.id,
       items: items, 
       total_price: total,
       status: 'PENDING',
       payment_status: 'UNPAID',
       is_closed: false,
       timestamp: timestamp,
       date_str: dateStr
    });

    if (!error) {
       setCart({});
       setView('SUCCESS');
       fetchAllData();
    } else {
       alert('下單失敗，請檢查網絡');
    }
  };

  // 订单: 更新/删除
  const updateOrderInDB = async (order: Order) => {
    await supabase.from('orders').update({
       items: order.items,
       total_price: order.totalPrice,
       status: order.status
    }).eq('id', order.id);
    fetchAllData();
  };

  const deleteOrderFromDB = async (id: number) => {
    await supabase.from('orders').delete().eq('id', id);
    fetchAllData();
  };

  // 广告: 保存
  const saveBannersToDB = async (newBanners: Banner[]) => {
     // 简单逻辑：清除所有旧banner，插入新banner
     await supabase.from('banners').delete().neq('id', 0); 
     const payload = newBanners.map(b => ({
        type: b.type, image: b.image, title: b.title, subtitle: b.subtitle
     }));
     await supabase.from('banners').insert(payload);
     alert('已發佈至雲端！');
     fetchAllData();
  };

  // ==========================================
  // UI 渲染 (逻辑与之前保持一致)
  // ==========================================

  const handleLogin = () => {
    if (inputLineId === adminCreds.username && inputLineName === adminCreds.password) { setView('ADMIN_DASHBOARD'); return; } 
    if (inputLineId.trim() && inputLineName.trim()) {
      setCurrentUser({ name: inputLineName, id: inputLineId });
      const hasHistory = orders.some(o => o.clientId === inputLineId);
      setView(hasHistory ? 'USER_MENU' : 'SHOP');
    } else { alert('請輸入 LINE ID 和 暱稱'); }
  };

  const PreviewBanner = () => isPreviewMode ? (
    <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-black text-[10px] font-black uppercase text-center py-1 z-50 flex justify-between px-4 items-center shadow-md">
      <span>🚧 裝修預覽模式中 (訂單不計入)</span>
      <button onClick={() => { setIsPreviewMode(false); setView('ADMIN_DASHBOARD'); }} className="bg-black text-white px-3 py-1 rounded-full flex items-center gap-1 hover:bg-gray-800"><LogOut size={10}/> 退出預覽</button>
    </div>
  ) : null;

  const ShopClosedBanner = () => !isShopOpen ? (
     <div className="bg-red-500 text-white text-xs font-bold text-center py-3 px-4 shadow-lg animate-pulse flex items-center justify-center gap-2"><AlertCircle size={16}/>目前已截單，請耐心等候，感謝您的支持</div>
  ) : null;

  const StandardNavBar = ({ title }: { title: string }) => (
    <div className={`bg-white p-4 border-b border-gray-100 sticky z-20 flex items-center justify-between shadow-sm ${isPreviewMode ? 'top-6' : 'top-0'}`}>
      <button onClick={() => setView('USER_MENU')} className="flex items-center gap-1 text-gray-600 active:text-black"><ChevronLeft size={20}/><span className="text-sm font-bold">返回菜單</span></button>
      <h1 className="font-bold text-sm absolute left-1/2 -translate-x-1/2 uppercase tracking-widest">{title}</h1><div className="w-10"></div>
    </div>
  );

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center text-gray-400 font-black tracking-widest animate-pulse">CONNECTING TO CHEN CLOUD...</div>;

  // WELCOME
  if (view === 'WELCOME') {
    const banners = activeBanners.filter(b => b.type === 'WELCOME');
    return (
      <div className="min-h-screen bg-white flex flex-col items-center relative font-sans">
        <PreviewBanner />
        <div className="w-full aspect-video relative overflow-hidden bg-gray-200">
           {banners.length > 0 ? banners.map((b, i) => (
             <div key={b.id || i} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === currentWelcomeBanner ? 'opacity-100 z-10' : 'opacity-0'}`}>{b.image && <img src={b.image} className="w-full h-full object-cover"/>}</div>
           )) : <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">NO BANNERS</div>}
           <div className="absolute inset-0 bg-black/10 z-10"></div>
        </div>
        <div className="w-full max-w-sm px-8 -mt-10 z-20">
          <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-8 border border-white/50 space-y-6">
             <div className="text-center space-y-1"><h1 className="text-2xl font-light tracking-[0.3em]">HELLÖ</h1><p className="text-[10px] text-gray-400 tracking-[0.4em] font-bold">CHEN STUDIO</p></div>
             <div className="space-y-4">
               <input type="text" value={inputLineId} onChange={e=>setInputLineId(e.target.value)} className="w-full bg-gray-50 border rounded-xl px-4 py-4 text-sm font-bold outline-none" placeholder="LINE ID"/>
               <input type="text" value={inputLineName} onChange={e=>setInputLineName(e.target.value)} className="w-full bg-gray-50 border rounded-xl px-4 py-4 text-sm font-bold outline-none" placeholder="暱稱"/>
             </div>
             <button onClick={handleLogin} className={`w-full py-4 rounded-xl text-xs font-black tracking-[0.2em] shadow-lg ${inputLineId && inputLineName ? 'bg-black text-white active:scale-95' : 'bg-gray-200 text-gray-400'}`}>進入系統</button>
          </div>
        </div>
      </div>
    );
  }

  // USER_MENU
  if (view === 'USER_MENU') {
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col relative">
        <button onClick={() => { setView('WELCOME'); setCurrentUser({name:'', id:''}); }} className="absolute top-6 left-6 text-gray-400 flex items-center gap-1 text-[10px] font-bold hover:text-black transition-colors"><LogOut size={14}/> 退出登錄</button>
        <div className="mt-20 space-y-2 mb-12"><h2 className="text-3xl font-black tracking-tighter">您好, {currentUser.name}</h2><p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">歡迎來到 CHEN STUDIO 採購預訂系統</p></div>
        <div className="grid gap-4">
          <button onClick={() => setView('SHOP')} className="group bg-black text-white p-8 rounded-[2.5rem] flex justify-between items-center shadow-xl active:scale-95 transition-all">
            <div className="text-left"><span className="block text-2xl font-black italic">SHOP</span><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">前往商城選購</span></div><div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors"><Plus/></div>
          </button>
          <button onClick={() => setView('ORDER_SUMMARY')} className="group bg-gray-50 p-8 rounded-[2.5rem] flex justify-between items-center border border-gray-100 active:scale-95 transition-all">
            <div className="text-left"><span className="block text-2xl font-black italic">LIST</span><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">查看已購清單</span></div><div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors"><ClipboardList/></div>
          </button>
        </div>
      </div>
    );
  }

  // SHOP
  if (view === 'SHOP') {
    const shopBanners = activeBanners.filter(b => b.type === 'SHOP');
    const cartCount = Object.values(cart).reduce((a,b) => a+b, 0);
    const filteredProducts = products.filter(p => p.isActive && p.name.toLowerCase().includes(shopSearch.toLowerCase()));
    return (
      <div className="min-h-screen bg-white pb-24 font-sans text-gray-800">
        <StandardNavBar title="SHOP" /><ShopClosedBanner />
        <div className="p-4"><div className="relative"><Search className="absolute left-3 top-3 text-gray-300" size={16}/><input placeholder="搜尋商品..." className="w-full bg-gray-50 rounded-2xl pl-10 py-3 text-xs outline-none" value={shopSearch} onChange={e=>setShopSearch(e.target.value)}/></div></div>
        <div className="relative w-full aspect-[3/1] bg-gray-100 overflow-hidden mb-4">
           {shopBanners.length > 0 ? shopBanners.map((b, i) => (
             <div key={b.id} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === currentShopBanner ? 'opacity-100' : 'opacity-0'}`}>{b.image && <img src={b.image} className="w-full h-full object-cover"/>}</div>
           )) : <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">NO BANNERS</div>}
        </div>
        <div className="px-4 grid grid-cols-2 gap-4">
           {filteredProducts.map(p => (
             <div key={p.id} className="space-y-2">
                <div className={`aspect-[3/4] bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 relative shadow-sm ${!isShopOpen ? 'grayscale' : ''}`}><img src={p.image || 'https://via.placeholder.com/300'} className="w-full h-full object-cover"/></div>
                <h4 className="text-[11px] font-bold line-clamp-1">{p.name}</h4>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">{p.msrp > p.price && (<span className="text-[10px] text-gray-400 line-through decoration-gray-400">{formatNT(p.msrp)}</span>)}<span className={`text-sm font-black ${p.msrp > p.price ? 'text-red-600' : 'text-black'}`}>{formatNT(p.price)}</span></div>
                  <button disabled={!isShopOpen} onClick={() => handleAddToCart(p.id)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md ${!isShopOpen ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white active:scale-75'}`}><Plus size={16}/></button>
                </div>
             </div>
           ))}
        </div>
        {cartCount > 0 && (<div className="fixed bottom-8 right-8 z-30"><button onClick={() => setView('CART_CONFIRM')} className="bg-black text-white w-16 h-16 rounded-full shadow-2xl flex items-center justify-center relative border-2 border-white"><ShoppingBag size={24}/><div className="absolute -top-1 -right-1 bg-red-600 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white">{cartCount}</div></button></div>)}
      </div>
    );
  }

  // SUCCESS
  if (view === 'SUCCESS') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-8"><CheckCircle size={50}/></div>
        <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">成功！</h2><p className="text-[10px] text-gray-400 mb-12 font-bold uppercase tracking-[0.2em]">已收錄採購需求至後台管理</p>
        <button onClick={() => setView('USER_MENU')} className="px-12 py-5 bg-black text-white rounded-[2rem] font-black tracking-[0.3em] shadow-xl active:scale-95 transition-all">確認訂單</button>
      </div>
    );
  }

  // ADMIN
  if (view === 'ADMIN_DASHBOARD') {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
           <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-sm"/> <span className="font-black text-sm uppercase">CHEN CLOUD ADMIN</span></div>
           <div className="flex gap-2">
             <button onClick={() => { setIsPreviewMode(true); setView('WELCOME'); }} className="px-3 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-50"><Play size={10}/> 進入裝修預覽</button>
             <button onClick={() => setView('WELCOME')} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-300"><LogOut size={18}/></button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 pb-28 max-w-2xl mx-auto w-full space-y-6">
           {adminTab === 'ORDERS' && (
             <div className="space-y-4">
               {/* 截單按鈕 (同步數據庫) */}
               <div onClick={toggleShopStatus} className={`w-full p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-sm ${isShopOpen ? 'bg-green-50 border-green-200 border text-green-700' : 'bg-red-50 border-red-200 border text-red-700'}`}>
                   <div className="flex items-center gap-3"><div className={`p-2 rounded-full ${isShopOpen ? 'bg-green-200' : 'bg-red-200'}`}><Power size={18}/></div><div className="flex flex-col"><span className="font-black text-sm">{isShopOpen ? '商店營業中 (OPEN)' : '商店已截單 (CLOSED)'}</span><span className="text-[10px] opacity-70">{isShopOpen ? '客戶可正常訪問商城下單' : '前台將顯示截單提示，禁止下單'}</span></div></div>
                   <div className={`w-12 h-6 rounded-full p-1 transition-colors ${isShopOpen ? 'bg-green-500' : 'bg-gray-300'}`}><div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isShopOpen ? 'translate-x-6' : 'translate-x-0'}`}/></div>
               </div>
               <div className="flex justify-between items-center"><h3 className="font-black text-xs uppercase text-gray-400 tracking-widest">訂單管理</h3><button onClick={() => { setOrderForm({name:'', id:'', items:[]}); setShowManualOrderModal(true); }} className="bg-black text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><UserPlus size={14}/> 代客下單</button></div>
               <div className="relative"><Search className="absolute left-3 top-3 text-gray-300" size={16}/><input placeholder="搜尋客戶..." className="w-full bg-white border rounded-xl pl-10 py-3 text-xs outline-none focus:border-black" value={adminOrderSearch} onChange={e=>setAdminOrderSearch(e.target.value)}/></div>
               {(() => {
                 const groups: any = {};
                 orders.forEach(o => {
                   if (adminOrderSearch && !o.clientName.includes(adminOrderSearch)) return;
                   const key = `${o.clientId}_${o.clientName}`;
                   if (!groups[key]) groups[key] = { name: o.clientName, id: o.clientId, orders: [], total: 0 };
                   groups[key].orders.push(o); groups[key].total += o.totalPrice;
                 });
                 return Object.entries(groups).map(([key, group]: any) => (
                   <div key={key} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                      <div onClick={() => setExpandedClientKey(expandedClientKey === key ? null : key)} className="p-4 flex justify-between items-center cursor-pointer bg-gray-50/30">
                        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">{group.name[0]}</div><div><div className="text-sm font-black">{group.name}</div><div className="text-[10px] font-bold text-gray-400">{formatNT(group.total)} · {group.orders.length} 筆單</div></div></div>
                        {expandedClientKey === key ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                      </div>
                      {expandedClientKey === key && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100">
                          {group.orders.map((o: any) => {
                             const aggregatedItems = getAggregatedItems(o.items);
                             return (
                                <div key={o.id} className="p-4 space-y-3">
                                   <div className="flex justify-between items-center"><span className="text-[10px] bg-gray-100 px-1 rounded font-mono font-black text-gray-400">{o.displayId}</span><button onClick={() => updateOrderInDB({...o, status: o.status === 'PENDING' ? 'CONFIRMED' : 'PENDING'})} className={`text-[10px] px-3 py-0.5 rounded-lg font-black uppercase ${o.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{o.status === 'PENDING' ? '待確認' : '已確認'}</button></div>
                                   <div className="space-y-2">
                                      {aggregatedItems.map((i: any, idx: number) => (
                                        <div key={idx} className="flex gap-2 items-center text-xs font-bold text-gray-700">
                                           <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden shrink-0 border border-gray-50">{i.image && <img src={i.image} className="w-full h-full object-cover"/>}</div>
                                           <div className="flex-1 truncate uppercase">{i.name}</div><div className="text-gray-400 font-mono">x{i.count}</div>
                                        </div>
                                      ))}
                                      {o.status === 'PENDING' && (
                                        <button onClick={() => { setTargetAppendOrderId(o.id); setOrderForm({name: o.clientName, id: o.clientId, items: []}); setShowAppendItemModal(true); }} className="w-full mt-2 py-2 border-2 border-dashed border-gray-100 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-50 uppercase">+ 追加商品種類 / 補單</button>
                                      )}
                                   </div>
                                   <div className="flex justify-between items-end pt-2 border-t border-gray-50 mt-2">
                                     <button onClick={() => { if(confirm('確定刪除此訂單？顧客端將同步消失。')) { deleteOrderFromDB(o.id); } }} className="text-red-300 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                                     <div className="font-black text-xs italic">TOTAL: {formatNT(o.totalPrice)}</div>
                                   </div>
                                </div>
                             );
                          })}
                        </div>
                      )}
                   </div>
                 ));
               })()}
             </div>
           )}

           {/* TAB: 採購統計 */}
           {adminTab === 'PURCHASE' && (
             <div className="space-y-4">
               <h3 className="font-black text-xs uppercase text-gray-400 tracking-widest">實收採購清單</h3>
               <div className="relative"><Search className="absolute left-3 top-3 text-gray-300" size={16}/><input placeholder="搜尋採購品項..." className="w-full bg-white border rounded-xl pl-10 py-3 text-xs outline-none focus:border-black shadow-sm" value={adminPurchaseSearch} onChange={e=>setAdminPurchaseSearch(e.target.value)}/></div>
               <div className="grid gap-3">
                 {(() => {
                    const map: any = {};
                    orders.forEach(o => {
                      o.items.forEach(i => {
                        if (adminPurchaseSearch && !i.name.includes(adminPurchaseSearch)) return;
                        const key = String(i.productId);
                        if(!map[key]) map[key] = { id: key, name: i.name, count: 0, buyers: [], cost: i.snapshotCost, price: i.snapshotPrice, image: i.image };
                        map[key].count += i.count;
                        map[key].buyers.push({ name: o.clientName, qty: i.count });
                      });
                    });
                    return Object.values(map).map((item: any) => {
                      const acquired = actualAcquired[item.id] || 0;
                      const needed = item.count;
                      const colorClass = acquired === needed ? 'text-green-600' : acquired > needed ? 'text-blue-600' : 'text-red-600';
                      return (
                        <div key={item.id} className="bg-white rounded-3xl border border-gray-100 p-4 shadow-sm space-y-3">
                          <div className="flex justify-between items-center gap-4">
                            <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden shrink-0 border">{item.image && <img src={item.image} className="w-full h-full object-cover"/>}</div>
                            
                            <div className="flex-1 min-w-0" onClick={() => setExpandedPurchaseId(expandedPurchaseId === item.id ? null : item.id)}>
                               <div className="text-[11px] font-black text-gray-800 uppercase truncate">{item.name}</div>
                               <div className={`text-2xl font-black italic tracking-tighter mt-0.5 flex items-center gap-2 ${colorClass}`}>
                                 {acquired} / {needed} <ChevronDown size={14} className="text-gray-300"/>
                               </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                               <span className="text-[8px] font-black text-gray-400 uppercase">實際買到</span>
                               <input type="number" value={acquired} onChange={(e) => setActualAcquired({...actualAcquired, [item.id]: Number(e.target.value)})} className="w-16 bg-gray-50 border rounded-lg p-2 text-center font-black text-sm outline-none focus:border-black"/>
                            </div>
                          </div>
                          {expandedPurchaseId === item.id && (
                            <div className="bg-gray-50 p-4 rounded-2xl space-y-4 text-[10px] font-bold border border-gray-100 animate-in fade-in duration-300">
                               <div className="space-y-1">
                                  <div className="text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-200 pb-1">客戶分配清單</div>
                                  {item.buyers.map((b:any, idx:number) => <div key={idx} className="flex justify-between"><span>{b.name}</span><span className="text-gray-400">X {b.qty}</span></div>)}
                               </div>
                               <div className="pt-2 border-t border-gray-200 grid grid-cols-2 gap-2 text-gray-500">
                                  <div>單件成本: {formatNT(item.cost)}</div><div>單件售價: {formatNT(item.price)}</div>
                                  <div className="text-black">預計收款: {formatNT(item.price * item.count)}</div><div className="text-red-500">實際支出: {formatNT(item.cost * acquired)}</div>
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                 })()}
               </div>
             </div>
           )}

           {/* TAB: 財務看板 */}
           {adminTab === 'FINANCE' && (
             <div className="space-y-6">
                <h3 className="font-black text-xs uppercase text-gray-400 tracking-widest">財務看板</h3>
                <div className="grid grid-cols-1 gap-4">
                   <div className="bg-white border p-6 rounded-[2.5rem] shadow-sm space-y-1">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">订单总金额 (收客)</div>
                      <div className="font-black text-3xl tracking-tighter">{formatNT(orders.reduce((sum, o) => sum + o.totalPrice, 0))}</div>
                   </div>
                   <div className="bg-white border p-6 rounded-[2.5rem] shadow-sm space-y-1">
                      <div className="text-[10px] font-black text-red-400 uppercase tracking-widest">下单总金额 (采购)</div>
                      <div className="font-black text-3xl tracking-tighter text-red-600">{formatNT(Object.entries(actualAcquired).reduce((sum, [pid, qty]) => { const p = products.find(prod => String(prod.id) === pid); return sum + (p ? p.cost * qty : 0); }, 0))}</div>
                   </div>
                   <div className="bg-black text-white p-8 rounded-[2.5rem] shadow-2xl space-y-1">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">代购下单差额 (订单 - 下单)</div>
                      <div className="font-black text-4xl tracking-tighter">
                        {(() => {
                          const revenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
                          const cost = Object.entries(actualAcquired).reduce((sum, [pid, qty]) => { const p = products.find(prod => String(prod.id) === pid); return sum + (p ? p.cost * qty : 0); }, 0);
                          const diff = revenue - cost;
                          return (<span className={diff >= 0 ? 'text-green-400' : 'text-red-500'}>{diff > 0 ? '+' : ''}{formatNT(diff)}</span>);
                        })()}
                      </div>
                   </div>
                </div>
                <button className="w-full bg-white border border-gray-100 py-5 rounded-3xl font-black uppercase text-xs flex items-center justify-center gap-3 active:scale-95 transition-all shadow-sm"><FileText size={20}/> 下載財務報表 (CSV)</button>
             </div>
           )}

           {adminTab === 'PRODUCTS' && (
             <div className="space-y-4">
               <div className="flex justify-between items-center"><h3 className="font-black text-xs uppercase text-gray-400 tracking-widest">雲端商品庫</h3><button onClick={() => { const nid=Date.now(); const newP={id:nid, sku:'', name:'', desc:'', price:0, msrp:0, cost:0, stockTotal:99, image:'', isActive:true}; setProducts([newP, ...products]); setEditingProductId(nid); setTempProductData(newP); }} className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2"><Plus size={14}/> 新增貨品</button></div>
               <div className="relative"><Search className="absolute left-3 top-3 text-gray-300" size={16}/><input placeholder="搜尋貨品名稱..." className="w-full bg-white border rounded-xl pl-10 py-3 text-xs outline-none focus:border-black" value={adminProductSearch} onChange={e=>setAdminProductSearch(e.target.value)}/></div>
               <div className="grid gap-3">
                 {products.filter(p => p.name && p.name.includes(adminProductSearch)).map(p => {
                   const isEditing = editingProductId === p.id;
                   const data = isEditing && tempProductData ? tempProductData : p;
                   return (
                     <div key={p.id} className={`bg-white rounded-3xl border p-4 flex flex-col gap-4 shadow-sm ${!data.isActive && 'opacity-40'}`}>
                         <div className="flex gap-4">
                            <div className="w-24 h-24 bg-gray-50 rounded-2xl overflow-hidden relative border">{data.image ? <img src={data.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-gray-300">NO IMAGE</div>}</div>
                            <div className="flex-1 space-y-2">
                               {isEditing ? (
                                 <div className="space-y-2">
                                   <input value={data.name} onChange={e=>setTempProductData({...data, name:e.target.value})} className="w-full text-xs font-black border rounded-lg p-2" placeholder="品名"/>
                                   <div className="grid grid-cols-3 gap-2">
                                      <input type="number" value={data.cost} onChange={e=>setTempProductData({...data, cost:Number(e.target.value)})} className="text-xs border rounded p-2" placeholder="成本"/>
                                      <input type="number" value={data.price} onChange={e=>setTempProductData({...data, price:Number(e.target.value)})} className="text-xs border rounded p-2" placeholder="售價"/>
                                      <input type="number" value={data.msrp} onChange={e=>setTempProductData({...data, msrp:Number(e.target.value)})} className="text-xs border rounded p-2 bg-gray-50" placeholder="原價(MSRP)"/>
                                   </div>
                                 </div>
                               ) : (
                                 <div className="space-y-1">
                                   <div className="text-sm font-black uppercase">{p.name}</div>
                                   <div className="flex gap-2 text-[10px] font-black flex-wrap">
                                      <span className="bg-red-50 text-red-500 px-2 py-1 rounded">成本: {formatNT(p.cost)}</span><span className="bg-black text-white px-2 py-1 rounded">售價: {formatNT(p.price)}</span>{p.msrp > p.price && <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded line-through">原價: {formatNT(p.msrp)}</span>}
                                   </div>
                                 </div>
                               )}
                            </div>
                         </div>
                         <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
                            {isEditing ? (
                              <button onClick={() => { saveProductToDB(data); setEditingProductId(null); }} className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Save size={14}/> 儲存雲端</button>
                            ) : (
                              <>
                                <button onClick={() => { setEditingProductId(p.id); setTempProductData(p); }} className="text-[10px] font-black uppercase text-blue-600 px-4 py-2">編輯內容</button>
                                <button onClick={() => { if(confirm('確認刪除此商品？')) deleteProductFromDB(p.id); }} className="text-red-300 p-2"><Trash2 size={16}/></button>
                              </>
                            )}
                         </div>
                      </div>
                    );
                 })}
               </div>
             </div>
           )}

           {adminTab === 'ADS' && (
              <div className="space-y-6">
                <div className="bg-gray-900 text-white p-6 rounded-3xl flex justify-between items-center shadow-lg">
                  <div><h3 className="font-black text-xs uppercase tracking-widest">廣告投放中心</h3><p className="text-[10px] text-gray-400 mt-1">支持 5秒自動絲滑輪播</p></div>
                  <button onClick={() => saveBannersToDB(draftBanners)} className="bg-white text-black px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 active:scale-95 transition-all"><Upload size={14}/> 發佈變更</button>
                </div>
                <div className="space-y-3">
                   <h4 className="font-black text-xs uppercase text-gray-500 tracking-widest pl-2 border-l-4 border-black">首頁登入頁 (Welcome)</h4><p className="text-[10px] font-bold text-red-400 px-2">建議尺寸: 1920 x 1080 px (16:9) 或 1080 x 1920 px (9:16)</p>
                   {draftBanners.filter(b => b.type === 'WELCOME').map(b => (
                     <div key={b.id || Math.random()} className="bg-white p-4 rounded-3xl border space-y-2 relative group">
                        <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden shadow-inner">{b.image && <img src={b.image} className="w-full h-full object-cover"/>}</div>
                        <input value={b.image} onChange={e => setDraftBanners(draftBanners.map(i => i === b ? {...i, image: e.target.value} : i))} className="w-full text-[10px] bg-gray-50 p-3 rounded-xl outline-none" placeholder="圖片網址..."/>
                        <button onClick={() => setDraftBanners(draftBanners.filter(i => i !== b))} className="absolute top-2 right-2 bg-black text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                     </div>
                   ))}
                   <button onClick={() => setDraftBanners([...draftBanners, {id: Date.now(), type: 'WELCOME', image: '', title: '', subtitle: ''}])} className="w-full py-4 border-2 border-dashed rounded-2xl text-[10px] font-black text-gray-400 uppercase hover:bg-gray-50">+ 新增首頁廣告</button>
                </div>
                <div className="space-y-3 pt-6 border-t border-gray-200">
                   <h4 className="font-black text-xs uppercase text-gray-500 tracking-widest pl-2 border-l-4 border-black">商城頂部 (Shop Header)</h4><p className="text-[10px] font-bold text-red-400 px-2">建議尺寸: 1200 x 400 px (3:1)</p>
                   {draftBanners.filter(b => b.type === 'SHOP').map(b => (
                     <div key={b.id || Math.random()} className="bg-white p-4 rounded-3xl border space-y-2 relative group">
                        <div className="aspect-[3/1] bg-gray-100 rounded-xl overflow-hidden shadow-inner">{b.image && <img src={b.image} className="w-full h-full object-cover"/>}</div>
                        <input value={b.image} onChange={e => setDraftBanners(draftBanners.map(i => i === b ? {...i, image: e.target.value} : i))} className="w-full text-[10px] bg-gray-50 p-3 rounded-xl outline-none" placeholder="圖片網址..."/>
                        <button onClick={() => setDraftBanners(draftBanners.filter(i => i !== b))} className="absolute top-2 right-2 bg-black text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                     </div>
                   ))}
                   <button onClick={() => setDraftBanners([...draftBanners, {id: Date.now()+1, type: 'SHOP', image: '', title: '', subtitle: ''}])} className="w-full py-4 border-2 border-dashed rounded-2xl text-[10px] font-black text-gray-400 uppercase hover:bg-gray-50">+ 新增商城廣告</button>
                </div>
              </div>
           )}

           {adminTab === 'SETTINGS' && (
              <div className="space-y-6">
                 <h3 className="font-black text-xs uppercase text-gray-400 tracking-widest">系統設置</h3>
                 <div className="bg-white p-8 rounded-[2.5rem] border space-y-6 shadow-sm">
                    <div className="space-y-2">
                       <h4 className="font-black text-sm border-b pb-2">管理員帳戶安全</h4>
                       <div><label className="text-[10px] font-black text-gray-400 uppercase">修改用戶名</label><div className="grid grid-cols-2 gap-2 mt-1"><input value={newCreds.name} onChange={e=>setNewCreds({...newCreds, name:e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold outline-none" placeholder="新用戶名"/><input value={newCreds.nameConfirm} onChange={e=>setNewCreds({...newCreds, nameConfirm:e.target.value})} className={`bg-gray-50 p-3 rounded-xl text-xs font-bold outline-none ${newCreds.name !== newCreds.nameConfirm ? 'border-red-300 border' : ''}`} placeholder="確認新用戶名"/></div></div>
                       <div><label className="text-[10px] font-black text-gray-400 uppercase">修改密碼</label><div className="grid grid-cols-2 gap-2 mt-1"><input type="password" value={newCreds.pass} onChange={e=>setNewCreds({...newCreds, pass:e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold outline-none" placeholder="新密碼"/><input type="password" value={newCreds.passConfirm} onChange={e=>setNewCreds({...newCreds, passConfirm:e.target.value})} className={`bg-gray-50 p-3 rounded-xl text-xs font-bold outline-none ${newCreds.pass !== newCreds.passConfirm ? 'border-red-300 border' : ''}`} placeholder="確認新密碼"/></div></div>
                       <button disabled={newCreds.name !== newCreds.nameConfirm || newCreds.pass !== newCreds.passConfirm || !newCreds.name || !newCreds.pass} onClick={() => { setAdminCreds({ username: newCreds.name, password: newCreds.pass }); alert('帳號安全設置已更新！'); }} className="w-full py-3 bg-black text-white rounded-xl text-xs font-black disabled:bg-gray-200 disabled:text-gray-400 transition-all">確認更新帳戶資訊</button>
                    </div>
                    <div className="pt-8 border-t">
                       <button onClick={() => { if(confirm('警告：這將清除所有訂單、商品與設置數據，且無法恢復！')) { localStorage.clear(); window.location.reload(); } }} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-red-100 transition-all"><ShieldCheck size={14}/> 恢復出廠設置 (清除數據)</button>
                    </div>
                 </div>
              </div>
           )}
        </div>

        <nav className="fixed bottom-0 w-full bg-white/80 backdrop-blur-xl border-t p-2 pb-10 flex justify-around text-[9px] font-black uppercase text-gray-300 z-40 max-w-2xl mx-auto left-0 right-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
          {[
            {id:'ORDERS',icon:ClipboardList,label:'訂單管理'}, {id:'PRODUCTS',icon:Package,label:'雲端商品庫'}, {id:'PURCHASE',icon:ShoppingBag,label:'採購統計'},
            {id:'ADS',icon:ImageIcon,label:'廣告管理'}, {id:'FINANCE',icon:Wallet,label:'財務看板'}, {id:'SETTINGS',icon:Settings,label:'系統設置'}
          ].map(tab=>(
            <button key={tab.id} onClick={()=>setAdminTab(tab.id as AdminTab)} className={`flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${adminTab===tab.id?'text-black scale-110':'hover:text-gray-500'}`}><tab.icon size={20} strokeWidth={adminTab===tab.id?3:2}/><span className="tracking-tighter">{tab.label}</span></button>
          ))}
        </nav>

        {(showManualOrderModal || showAppendItemModal) && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 flex flex-col max-h-[85vh] animate-in zoom-in duration-300 shadow-2xl">
                 <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl tracking-tighter uppercase">{showAppendItemModal ? '追加商品種類' : '代客下單'}</h3><button onClick={() => { setShowManualOrderModal(false); setShowAppendItemModal(false); setShowProductPicker(false); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button></div>
                 {showManualOrderModal && !showProductPicker && (<div className="space-y-3 mb-6"><input placeholder="客戶 LINE ID" value={orderForm.id} onChange={e=>setOrderForm({...orderForm, id:e.target.value})} className="w-full bg-gray-50 border p-4 rounded-2xl text-sm font-bold outline-none"/><input placeholder="客戶 暱稱" value={orderForm.name} onChange={e=>setOrderForm({...orderForm, name:e.target.value})} className="w-full bg-gray-50 border p-4 rounded-2xl text-sm font-bold outline-none"/></div>)}
                 {showProductPicker ? (
                    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-2xl grid grid-cols-2 gap-3 mb-4">
                       {products.filter(p=>p.isActive).map(p => (
                          <div key={p.id} onClick={() => { setOrderForm({...orderForm, items: [...orderForm.items, {productId: p.id, name: p.name, count: 1, snapshotPrice: p.price, snapshotCost: p.cost, image: p.image}]}); setShowProductPicker(false); }} className="aspect-square bg-white rounded-2xl border-2 border-white overflow-hidden relative cursor-pointer shadow-sm hover:scale-105 transition-all group">{p.image && <img src={p.image} className="w-full h-full object-cover"/>}<div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-black p-2 truncate uppercase">{p.name}</div></div>
                       ))}
                    </div>
                 ) : (
                    <div className="flex-1 overflow-y-auto mb-6 p-2 space-y-3">
                       {orderForm.items.map((item, idx) => (<div key={idx} className="flex gap-3 items-center bg-gray-50 p-3 rounded-2xl border border-white shadow-sm"><div className="flex-1 text-[10px] font-black uppercase truncate">{item.name}</div><div className="flex items-center gap-2"><button onClick={() => { const ni=[...orderForm.items]; ni[idx].count--; setOrderForm({...orderForm, items: ni.filter(it=>it.count>0)}); }} className="w-6 h-6 bg-white rounded-full flex items-center justify-center border hover:bg-gray-100"><Minus size={12}/></button><span className="text-xs font-black">{item.count}</span><button onClick={() => { const ni=[...orderForm.items]; ni[idx].count++; setOrderForm({...orderForm, items: ni}); }} className="w-6 h-6 bg-white rounded-full flex items-center justify-center border hover:bg-gray-100"><Plus size={12}/></button></div></div>))}
                       <button onClick={() => setShowProductPicker(true)} className="w-full py-4 border-2 border-dashed rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:bg-gray-50 transition-all">+ 選擇商品</button>
                    </div>
                 )}
                 {!showProductPicker && orderForm.items.length > 0 && (<button onClick={() => { 
                       if (showAppendItemModal && targetAppendOrderId) {
                         setOrders(prev => prev.map(o => { if (o.id !== targetAppendOrderId) return o; const merged = mergeOrderItems(o.items, orderForm.items); return { ...o, items: merged, totalPrice: recalculateTotal(merged) }; }));
                       } else {
                         const total = recalculateTotal(orderForm.items);
                         const nOrder: Order = { id: Date.now(), displayId: `#${String(orders.length+1).padStart(3,'0')}`, clientName: orderForm.name, clientId: orderForm.id, items: orderForm.items, totalPrice: total, status: 'CONFIRMED', paymentStatus: 'UNPAID', isClosed: false, timestamp: Date.now(), dateStr: new Date().toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit'}) };
                         // 提交到 DB
                         handleSubmitNewOrder(); // 复用逻辑
                       }
                       setShowManualOrderModal(false); setShowAppendItemModal(false); setOrderForm({name:'', id:'', items:[]});
                    }} className="w-full py-5 bg-black text-white rounded-3xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">確認提交訂單</button>
                 )}
              </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}