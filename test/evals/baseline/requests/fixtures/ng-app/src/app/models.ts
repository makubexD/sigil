export interface User {
  id: string;
  name: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Order {
  id: string;
  customer: string;
  total: number;
}

export interface Product {
  sku: string;
  title: string;
}

export interface Profile {
  id: string;
  name: string;
}

export interface CartItem {
  sku: string;
  price: number;
  quantity: number;
}

export interface Notice {
  id: string;
  text: string;
}

export interface Report {
  id: string;
  title: string;
}

export interface OrderRow {
  id: string;
  total: number;
}

export interface Receipt {
  id: string;
}

export interface Row {
  sku: string;
  price: number | null;
}

export interface Price {
  label: string;
  amount: number;
}
