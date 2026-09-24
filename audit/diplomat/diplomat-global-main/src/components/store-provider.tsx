/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Product } from "@/lib/products";
import { parseStoredCartState, serializeStoredCart, type StoredCartLine } from "@/lib/cart-storage";

type CartLine = StoredCartLine;

interface StoreContextValue {
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  cartProducts: Array<{ product: Product; quantity: number }>;
  cartCompatibilityIssue: boolean;
  isDark: boolean;
  addToCart: (productId: string, productData?: CartLine["product"]) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleTheme: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isDark, setIsDark] = useState(true); // Default dark — script tag in __root.tsx sets class before hydration
  const [isReady, setIsReady] = useState(false);
  const [cartCompatibilityIssue, setCartCompatibilityIssue] = useState(false);

  useEffect(() => {
    const savedCart = window.localStorage.getItem("dg-cart");
    const savedTheme = window.localStorage.getItem("dg-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedCart) {
      try {
        const parsed = parseStoredCartState(savedCart);
        setCart(parsed.items);
        setCartCompatibilityIssue(parsed.invalidItemCount > 0);
      } catch {
        window.localStorage.removeItem("dg-cart");
      }
    }

    const dark = savedTheme ? savedTheme === "dark" : true; // Default dark for new users
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) window.localStorage.setItem("dg-cart", serializeStoredCart(cart));
  }, [cart, isReady]);

  const value = useMemo<StoreContextValue>(() => {
    const cartProducts = cart.flatMap((line) => {
      // First try embedded product data (for DB products)
      if (line.product) {
        return [{ product: line.product as Product, quantity: line.quantity }];
      }
      // Items without current embedded product data cannot use a sample catalogue.
      return [];
    });

    return {
      cart,
      cartProducts,
      cartCount: cart.reduce((total, line) => total + line.quantity, 0),
      cartTotal: cartProducts.reduce(
        (total, line) => total + line.product.price * line.quantity,
        0,
      ),
      cartCompatibilityIssue,
      isDark,
      addToCart: (productId, productData?) => {
        setCartCompatibilityIssue(false);
        setCart((current) => {
          const existing = current.find((line) => line.productId === productId);
          if (existing) {
            return current.map((line) =>
              line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
            );
          }
          return [...current, { productId, quantity: 1, product: productData }];
        });
      },
      removeFromCart: (productId) => {
        setCartCompatibilityIssue(false);
        setCart((current) => current.filter((line) => line.productId !== productId));
      },
      updateQuantity: (productId, quantity) => {
        setCartCompatibilityIssue(false);
        setCart((current) =>
          quantity < 1
            ? current.filter((line) => line.productId !== productId)
            : current.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
        );
      },
      clearCart: () => {
        setCartCompatibilityIssue(false);
        setCart([]);
      },
      toggleTheme: () =>
        setIsDark((current) => {
          const next = !current;
          document.documentElement.classList.toggle("dark", next);
          window.localStorage.setItem("dg-theme", next ? "dark" : "light");
          return next;
        }),
    };
  }, [cart, cartCompatibilityIssue, isDark]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
