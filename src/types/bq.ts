export interface LineItem {
  line_item_id: number;
  submission_id: number;
  category_id: number;
  item_no: string;
  location: string;
  description: string;
  specifications: string;
  brand: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  amount: number;
  sort_order: number;
  parent_item_id?: number | null;
  depth?: number;
  indent?: string;
  category_name: string;
}

export interface Category {
  category_id: number;
  category_name: string;
  sort_order: number;
  items: LineItem[];
}

export interface CreateItemDto {
  submission_id: number;
  category_id: number;
  parent_item_id?: number | null;
  location: string;
  description: string;
  specifications: string;
  brand: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
}