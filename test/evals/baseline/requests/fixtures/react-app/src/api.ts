import { csrfToken } from './csrf';
import { request } from './http';

export interface Project {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  total: number;
}

export interface Invoice {
  id: string;
  amount: number;
}

export interface Product {
  id: string;
  title: string;
  price: number;
}

export interface User {
  id: string;
  name: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Payment {
  name: string;
  email: string;
  cardNumber: string;
}

const write = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const fetchProjects = () => request<Project[]>('/projects');

export const renameProject = (id: string, name: string) =>
  request<Project>(`/projects/${id}`, write('PATCH', { name }));

export const fetchOrders = (customerId: string, signal?: AbortSignal) =>
  request<Order[]>(`/customers/${customerId}/orders`, { signal });

export const fetchInvoices = () => request<Invoice[]>('/invoices');

export const fetchRevenue = () => request<{ month: string; total: number }[]>('/revenue');

export const fetchRecentOrders = () => request<Order[]>('/orders/recent');

export const saveDraft = (text: string) =>
  request<{ id: string }>('/drafts', write('POST', { text }));

export const uploadAvatar = (image: Blob) =>
  request<{ url: string }>('/avatar', {
    method: 'PUT',
    headers: { 'X-CSRF-Token': csrfToken() },
    body: image,
  });

export const pay = (payment: Payment) =>
  request<{ receipt: string }>('/payments', write('POST', payment));

/** Signs the user in. The server also sets the session cookie, which `fetchMe` answers from. */
export const signIn = (email: string, password: string) =>
  request<Session>('/session', write('POST', { email, password }));

export const signOut = () => request<Record<string, never>>('/session', write('DELETE'));

/** The signed-in user, from the session cookie. Answers 401 when nobody is signed in. */
export const fetchMe = () => request<User>('/me');
