import React, { useEffect, useState } from 'react';
import {
  Search,
  LayoutDashboard,
  Bell,
  Receipt,
  ShoppingCart,
  Users,
  BarChart3,
  Boxes,
  History,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  PanelLeft,
  ChefHat,
  ShieldCheck,
  Settings,
  LogOut,
  HelpCircle,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HISTORIQUE_ACCESS_PERMISSION, HISTORIQUE_URL, MANAGE_ROLES_PERMISSION } from '../data/rbacModel';

interface SubMenuItem {
  id: string;
  label: string;
  // Which permission gates this page — a sub-item with none is always shown (nothing sensitive
  // behind it). The real enforcement is always server-side (requirePermission); this only keeps
  // the nav from listing pages a user's every request to would 403 on.
  permission?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  subItems?: SubMenuItem[];
  permission?: string;
}

interface MenuSection {
  heading: string;
  items: MenuItem[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onUpgradeClick?: () => void;
  isDarkMode?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeSubItem?: string;
  setActiveSubItem?: (sub: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  isDarkMode = false,
  isCollapsed = false,
  onToggleCollapse,
  activeSubItem: propActiveSubItem,
  setActiveSubItem: propSetActiveSubItem,
}) => {
  const { hasPermission, logout, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  // Mobile only: the account row (name + arrow, at the bottom of the drawer) opens this as a
  // full-screen panel rather than expanding inline — there's no room in a phone-width drawer for
  // Sessions/Paramètres/Rôles/Aide/Déconnexion to sit as a flat list without crowding the nav
  // above it. Reset alongside the drawer itself so it never flashes open on the next reopen.
  const [showMobileAccountPanel, setShowMobileAccountPanel] = useState(false);
  useEffect(() => {
    if (!isOpen) setShowMobileAccountPanel(false);
  }, [isOpen]);
  // No section is force-open by default — a section only expands because the user toggled it, or
  // because it's the one currently active (see isMenuOpen below), never as a hardcoded default.
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [localActiveSubItem, setLocalActiveSubItem] = useState<string>('');

  const activeSubItem = propActiveSubItem !== undefined ? propActiveSubItem : localActiveSubItem;
  const setActiveSubItem = (sub: string) => {
    if (propSetActiveSubItem) propSetActiveSubItem(sub);
    setLocalActiveSubItem(sub);
  };

  const toggleMenu = (menuId: string) => {
    setOpenMenus((prev) => {
      const isCurrentlyOpen = Boolean(prev[menuId]);
      return isCurrentlyOpen ? {} : { [menuId]: true };
    });
  };

  const menuSections: MenuSection[] = [
    {
      heading: "Vue d'ensemble",
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard:view' },
        { id: 'notifications', label: 'Notifications & Alertes', icon: Bell, permission: 'notifications:view' },
      ],
    },
    {
      heading: 'Ventes et recettes',
      items: [
        {
          id: 'sales_mgmt',
          label: 'Gestion des ventes',
          icon: Receipt,
          subItems: [
            { id: 'sales', label: 'Ventes', permission: 'sales:view' },
            { id: 'sales_manual_add', label: 'Ajoute Manuelle Ventes', permission: 'sales:create' },
            { id: 'sales_import', label: 'Import Excel/CSV', permission: 'sales:create' },
            { id: 'sales_cash_check', label: 'Calcul du quotidien', permission: 'sales:cash_check' },
          ],
        },
        {
          id: 'stock',
          label: 'Stock',
          icon: Boxes,
          subItems: [
            { id: 'stock_overview', label: 'Stock', permission: 'stock:view' },
            { id: 'stock_movements', label: 'Mouvements', permission: 'stock:manage' },
            { id: 'stock_inventory', label: 'Inventaires', permission: 'stock:manage' },
            { id: 'stock_losses', label: 'Pertes & ajustements', permission: 'stock:manage' },
            { id: 'stock_lots', label: 'Lots & péremptions', permission: 'stock:view' },
            { id: 'stock_units', label: 'Unités', permission: 'stock:manage' },
            { id: 'stock_import', label: 'Import Excel/CSV', permission: 'stock:import' },
          ],
        },
        {
          id: 'products_recipes_mgmt',
          label: 'Gestion des produits',
          icon: ChefHat,
          subItems: [
            { id: 'prm_products', label: 'Produits', permission: 'products:view' },
            { id: 'prm_add_product', label: 'Ajout produits', permission: 'products:manage' },
            { id: 'prm_subrecipes', label: 'Sous-recettes', permission: 'products:manage' },
            { id: 'prm_catalog', label: 'Catalogue', permission: 'products:view' },
            { id: 'prm_import', label: 'Import Excel/CSV', permission: 'products:import' },
          ],
        },
      ],
    },
    {
      heading: 'Achat et dépenses',
      items: [
        {
          id: 'expenses_mgmt',
          label: 'Gestion des dépenses',
          icon: Receipt,
          subItems: [
            { id: 'expenses', label: 'Dépenses', permission: 'expenses:view' },
            { id: 'expenses_categories', label: 'Catégories de dépenses', permission: 'expenses:categories' },
          ],
        },
        {
          id: 'purchases_mgmt',
          label: 'Gestion des achats',
          icon: ShoppingCart,
          subItems: [
            { id: 'purchases_acquisitions', label: 'Achats et acquisitions', permission: 'purchases:view' },
            { id: 'purchases_suppliers', label: 'Listes des fournisseurs', permission: 'purchases:suppliers' },
            { id: 'purchases_invoices', label: 'Factures', permission: 'purchases:view' },
            { id: 'purchases_ocr', label: 'OCR des factures', permission: 'purchases:ocr' },
            { id: 'purchases_import', label: 'Import Excel/CSV', permission: 'purchases:import' },
          ],
        },
      ],
    },
    {
      heading: 'Rapports et analyses',
      items: [
        {
          id: 'reports_mgmt',
          label: 'Rapports de gestion',
          icon: BarChart3,
          subItems: [
            { id: 'report_monthly', label: 'Rapport mensuel de gestion', permission: 'reports:view' },
            { id: 'report_sales', label: 'Rapport sur les ventes', permission: 'reports:view' },
            { id: 'report_purchases', label: 'Rapport achats & fournisseurs', permission: 'reports:view' },
            { id: 'report_expenses', label: 'Rapport sur les dépenses', permission: 'reports:view' },
            { id: 'report_stocks', label: 'Rapport sur les stocks', permission: 'reports:view' },
            { id: 'report_finance', label: 'Rapport financier', permission: 'reports:financial' },
            { id: 'report_tax', label: 'Rapport fiscal', permission: 'reports:financial' },
            { id: 'report_export', label: 'Export', permission: 'reports:view' },
            { id: 'report_archive', label: 'Archive', permission: 'reports:view' },
          ],
        },
      ],
    },
    {
      heading: 'Équipe et accès',
      items: [
        {
          id: 'staff_mgmt',
          label: 'Gestion du personnel',
          icon: Users,
          subItems: [
            { id: 'staff_employees', label: 'Employés', permission: 'hr:view' },
            { id: 'staff_schedule', label: 'Planning & Présence', permission: 'hr:view' },
            { id: 'staff_finance', label: 'Suivi financier', permission: 'hr:financial' },
          ],
        },
      ],
    },
    {
      heading: "Journal d'activité",
      items: [
        {
          id: 'activity_log',
          label: "Journal d'activité",
          icon: History,
          permission: 'activity_log:view',
        },
      ],
    },
  ];

  // Purely a UX nicety (declutters the nav of pages every request to would 403 on) — the actual
  // enforcement is always server-side, see requirePermission in server/middleware/auth.ts.
  const isMenuItemVisible = (item: MenuItem): boolean => {
    if (item.subItems && item.subItems.length > 0) {
      return item.subItems.some((sub) => !sub.permission || hasPermission(sub.permission));
    }
    return !item.permission || hasPermission(item.permission);
  };
  const visibleSubItems = (item: MenuItem): SubMenuItem[] =>
    (item.subItems ?? []).filter((sub) => !sub.permission || hasPermission(sub.permission));

  // "Ventes" is the one subitem routed via its own top-level tab id ('sales') rather than its
  // parent's ('sales_mgmt') — every other parent routes all of its subitems through its own id.
  const expectedTabForSubItem = (parentId: string, subId: string): string => (subId === 'sales' ? 'sales' : parentId);

  const isSubItemActive = (parentId: string, subId: string): boolean =>
    activeTab === expectedTabForSubItem(parentId, subId) && activeSubItem === subId;

  const isParentItemActive = (item: MenuItem): boolean =>
    activeTab === item.id || (item.id === 'sales_mgmt' && activeTab === 'sales');

  // Auto-expand whichever section contains the newly active page — but only in reaction to
  // activeTab actually changing, so a user who manually collapses the active section afterward
  // isn't fought by this effect snapping it back open on every render.
  useEffect(() => {
    const activeParent = menuSections.flatMap((s) => s.items).find((item) => item.subItems && isParentItemActive(item));
    if (activeParent) {
      setOpenMenus((prev) => (prev[activeParent.id] && Object.keys(prev).length === 1 ? prev : { [activeParent.id]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Collapsed items flattened
  const allMenuItemsById = new Map(menuSections.flatMap((s) => s.items).map((item) => [item.id, item]));
  const collapsedItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'notifications', label: 'Notifications & Alertes', icon: Bell },
    { id: 'sales_mgmt', label: 'Gestion des ventes', icon: Receipt },
    { id: 'stock', label: 'Stock', icon: Boxes },
    { id: 'expenses_mgmt', label: 'Gestion des dépenses', icon: Receipt },
    { id: 'purchases_mgmt', label: 'Gestion des achats', icon: ShoppingCart },
    { id: 'products_recipes_mgmt', label: 'Gestion des produits', icon: ChefHat },
    { id: 'reports_mgmt', label: 'Rapports de gestion', icon: BarChart3 },
    { id: 'staff_mgmt', label: 'Gestion du personnel', icon: Users },
    { id: 'activity_log', label: "Journal d'activité", icon: History },
  ].filter((item) => {
    const source = allMenuItemsById.get(item.id);
    return source ? isMenuItemVisible(source) : true;
  });

  // Filtering by permission, then by search query
  const query = searchQuery.trim().toLowerCase();
  const filteredSections = menuSections
    .map((sec) => ({ ...sec, items: sec.items.filter(isMenuItemVisible) }))
    .map((sec) => {
      if (!query) return sec;
      const matchingItems = sec.items.filter((item) => {
        const itemMatches = item.label.toLowerCase().includes(query);
        const matchingSubs = visibleSubItems(item).some((sub) =>
          sub.label.toLowerCase().includes(query)
        );
        return itemMatches || Boolean(matchingSubs);
      });

      return {
        ...sec,
        items: matchingItems,
      };
    })
    .filter((sec) => sec.items.length > 0);

  const handleParentClick = (item: MenuItem) => {
    if (item.subItems && item.subItems.length > 0) {
      toggleMenu(item.id);
    } else {
      setActiveTab(item.id);
      setActiveSubItem('');
      if (window.innerWidth < 1024 && onClose) onClose();
    }
  };

  const handleSubItemClick = (parentId: string, subId: string) => {
    if (subId === 'sales') {
      setActiveTab('sales');
      setActiveSubItem('sales');
    } else {
      setActiveTab(parentId);
      setActiveSubItem(subId);
    }
    if (window.innerWidth < 1024 && onClose) onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          id="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed lg:sticky top-0 left-0 h-screen ${
          isCollapsed ? 'lg:w-16 w-64' : 'w-64'
        } ${
          isDarkMode ? 'bg-[#151D2A] text-gray-200' : 'bg-white text-gray-700'
        } z-50 flex flex-col transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {isCollapsed ? (
          /* Collapsed Icon-Only View matching sales.png */
          <div className="flex flex-col h-full items-center py-3 select-none">
            {/* Logo box */}
            <button
              onClick={onToggleCollapse}
              title="Développer le menu"
              className="w-10 h-10 rounded-xl bg-[#151D2A] border border-gray-700/50 flex items-center justify-center shadow-sm hover:scale-105 transition cursor-pointer mb-3 overflow-hidden"
            >
              <img src="/logo-icon-dark.png" alt="Café Noir" className="w-full h-full object-contain p-1.5" />
            </button>

            {/* List of icons without texts */}
            <div className="flex-1 w-full flex flex-col items-center gap-1.5 px-2 overflow-y-auto overscroll-contain custom-scrollbar">
              {collapsedItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeTab === item.id ||
                  (item.id === 'sales_mgmt' && activeTab === 'sales');

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'sales_mgmt') {
                        setActiveTab('sales');
                        setActiveSubItem('sales');
                      } else if (item.id === 'stock') {
                        setActiveTab('stock');
                        setActiveSubItem('stock_overview');
                      } else if (item.id === 'products_recipes_mgmt') {
                        setActiveTab('products_recipes_mgmt');
                        setActiveSubItem('prm_products');
                      } else {
                        setActiveTab(item.id);
                        setActiveSubItem('');
                      }
                      if (window.innerWidth < 1024 && onClose) onClose();
                    }}
                    title={item.label}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer group relative ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#00A86B] font-bold shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60'
                    }`}
                  >
                    <Icon size={18} />
                    {/* Hover tooltip */}
                    <span className="absolute left-full ml-3 px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-md">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Full Expanded Sidebar */
          <>
            {/* Header / Brand — on mobile, also where the account entry point lives now: logo,
                then the connected user's name + arrow (opens the full-screen account panel, see
                below), then the drawer's own close button, all on one line. Both the name/arrow
                button and the close button are lg:hidden — desktop keeps only the logo here and
                uses the Header's own profile dropdown for account actions instead. */}
            <div className="p-4 pb-2 flex items-center gap-2">
              <img
                src={isDarkMode ? '/logo-icon-dark.png' : '/logo.png'}
                alt="Café Noir"
                className="h-8 w-auto object-contain shrink-0"
              />

              <button
                type="button"
                onClick={() => setShowMobileAccountPanel(true)}
                className="lg:hidden flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {user?.fullName ?? 'Mon compte'}
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              </button>

              {onClose && (
                <button
                  id="close-sidebar-button"
                  onClick={onClose}
                  className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Search input */}
            <div className="px-4 py-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="sidebar-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Le menu de recherche..."
                  className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-800/80 border-gray-700 text-gray-200 placeholder-gray-500 focus:border-emerald-500'
                      : 'bg-gray-50/60 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-emerald-500'
                  } outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all`}
                />
              </div>
            </div>

            {/* Navigation sections */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-1 space-y-2 custom-scrollbar">
              {filteredSections.map((section) => (
                <div
                  key={section.heading}
                  data-slot="sidebar-group"
                  data-sidebar="group"
                  className="relative flex w-full min-w-0 flex-col p-2 px-1.5 py-0 mt-2"
                >
                  <div
                    data-slot="sidebar-group-label"
                    data-sidebar="group-label"
                    className="text-sidebar-foreground/70 ring-sidebar-ring h-7 shrink-0 items-center rounded-md text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 flex w-full px-2 pt-1 pb-1 justify-start"
                  >
                    <span className="text-[13px] font-bold capitalize tracking-wide text-gray-500 dark:text-gray-400 leading-none">
                      {section.heading}
                    </span>
                  </div>

                  <ul data-slot="sidebar-menu" data-sidebar="menu" className="flex w-full min-w-0 flex-col gap-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const hasSubmenu = Boolean(item.subItems && item.subItems.length > 0);
                      const isParentActive = isParentItemActive(item);
                      const isMenuOpen = Boolean(openMenus[item.id] || (query && hasSubmenu));

                      return (
                        <div key={item.id}>
                          <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className="group/menu-item relative">
                            <button
                              type="button"
                              data-slot="sidebar-menu-button"
                              data-sidebar="menu-button"
                              data-size="default"
                              data-active={isParentActive ? 'true' : 'false'}
                              data-state={isMenuOpen ? 'open' : 'closed'}
                              onClick={() => handleParentClick(item)}
                              className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-primary active:text-primary h-8 text-sm cursor-pointer"
                            >
                              <div className="flex items-center gap-2 w-full min-w-0 justify-start text-left">
                                <Icon className="lucide h-4 w-4 flex-shrink-0" />
                                <span className="truncate flex-1 text-xs sm:text-sm">{item.label}</span>
                                {hasSubmenu && (
                                  isMenuOpen ? (
                                    <ChevronDown className="lucide lucide-chevron-down h-3 w-3 ml-auto flex-shrink-0 opacity-70" />
                                  ) : (
                                    <ChevronRight className="lucide lucide-chevron-right h-3 w-3 ml-auto flex-shrink-0 opacity-70" />
                                  )
                                )}
                              </div>
                            </button>
                          </li>

                          {hasSubmenu && isMenuOpen && item.subItems && (
                            <ul
                              data-slot="sidebar-menu-sub"
                              data-sidebar="menu-sub"
                              className="border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden mt-0.5"
                            >
                              {visibleSubItems(item).map((sub) => {
                                const isSubActive = isSubItemActive(item.id, sub.id);
                                return (
                                  <div key={sub.id}>
                                    <li
                                      data-slot="sidebar-menu-sub-item"
                                      data-sidebar="menu-sub-item"
                                      className="group/menu-sub-item relative [&:has([data-active=true])]:before:absolute [&:has([data-active=true])]:before:left-[-11px] [&:has([data-active=true])]:before:top-0 [&:has([data-active=true])]:before:h-full [&:has([data-active=true])]:before:w-[2px] [&:has([data-active=true])]:before:bg-primary [&:has([data-active=true])]:before:rounded-full"
                                    >
                                      <button
                                        type="button"
                                        data-slot="sidebar-menu-sub-button"
                                        data-sidebar="menu-sub-button"
                                        data-size="md"
                                        data-active={isSubActive ? 'true' : 'false'}
                                        onClick={() => handleSubItemClick(item.id, sub.id)}
                                        className="text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-xs group-data-[collapsible=icon]:hidden flex items-center gap-2 justify-start text-left w-full cursor-pointer transition-colors"
                                      >
                                        <span className="truncate">{sub.label}</span>
                                      </button>
                                    </li>
                                  </div>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

          </>
        )}
      </aside>

      {/* Full-screen mobile account panel — opened from the row above. Its own top-level overlay
          (not confined to the drawer's width) so it reads as a real page, the way an account
          screen does in a native mobile app, rather than a cramped in-drawer submenu. */}
      {showMobileAccountPanel && (
        <div className="fixed inset-0 z-[60] lg:hidden bg-white dark:bg-[#151D2A] flex flex-col animate-in fade-in duration-150">
          <div className="flex items-center gap-2 p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowMobileAccountPanel(false)}
              className="p-1.5 -ml-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              aria-label="Retour"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Mon compte</h2>
          </div>

          <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <span className="w-11 h-11 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-base font-bold shrink-0">
              {(user?.fullName ?? '?').trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.fullName ?? 'Utilisateur'}</span>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('account_sessions');
                setActiveSubItem('');
                setShowMobileAccountPanel(false);
                if (onClose) onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-left"
            >
              <ShieldCheck size={18} className="text-gray-400 shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Sessions &amp; appareils</span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('settings');
                setActiveSubItem('');
                setShowMobileAccountPanel(false);
                if (onClose) onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-left"
            >
              <Settings size={18} className="text-gray-400 shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Paramètres</span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
            {hasPermission(MANAGE_ROLES_PERMISSION) && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('roles_permissions');
                  setActiveSubItem('');
                  setShowMobileAccountPanel(false);
                  if (onClose) onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-left"
              >
                <Users size={18} className="text-gray-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Rôles &amp; permissions</span>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )}
            {hasPermission(HISTORIQUE_ACCESS_PERMISSION) && (
              <a
                href={HISTORIQUE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setShowMobileAccountPanel(false);
                  if (onClose) onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-left"
              >
                <ClipboardList size={18} className="text-gray-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Historique &amp; Comptage</span>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </a>
            )}
            <a
              href="https://docs.cafenoir.tn"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setShowMobileAccountPanel(false);
                if (onClose) onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-left"
            >
              <HelpCircle size={18} className="text-gray-400 shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Aide &amp; Support</span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </a>

            <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

            <button
              type="button"
              onClick={() => {
                setShowMobileAccountPanel(false);
                if (onClose) onClose();
                logout();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer text-left"
            >
              <LogOut size={18} className="text-rose-500 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-rose-600">Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
