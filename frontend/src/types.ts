export type Role = "admin" | "user";

export type UserSafe = {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  productId: string;
  type: "CARICO" | "SCARICO";
  quantity: number;
  note?: string | null;
  createdAt: string;
};

export type CloudPayload = {
  products: Product[];
  transactions: Transaction[];
  users: UserSafe[];
};
