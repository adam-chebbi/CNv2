import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';
import type { ProductCategory, ProductSubCategory, SubRecipe } from '../data/productsModel';
import type { CatalogArticle, CatalogExtra } from '../data/manualSalesCatalog';

export const getProductCategories = () => apiGet<ProductCategory[]>('/product-categories');
export const createProductCategory = (name: string) => apiPost<ProductCategory>('/product-categories', { name });
export const renameProductCategory = (id: string, name: string) => apiPut<ProductCategory>(`/product-categories/${id}`, { name });
export const deleteProductCategory = (id: string) => apiDelete<void>(`/product-categories/${id}`);

export const getProductSubCategories = () => apiGet<ProductSubCategory[]>('/product-subcategories');
export const createProductSubCategory = (categoryId: string, name: string) => apiPost<ProductSubCategory>('/product-subcategories', { categoryId, name });
export const renameProductSubCategory = (id: string, categoryId: string, name: string) => apiPut<ProductSubCategory>(`/product-subcategories/${id}`, { categoryId, name });
export const deleteProductSubCategory = (id: string) => apiDelete<void>(`/product-subcategories/${id}`);

export const getCatalogExtras = () => apiGet<CatalogExtra[]>('/catalog-extras');
export const createCatalogExtra = (extra: Omit<CatalogExtra, 'id'>) => apiPost<CatalogExtra>('/catalog-extras', extra);
export const updateCatalogExtra = (id: string, extra: Omit<CatalogExtra, 'id'>) => apiPut<CatalogExtra>(`/catalog-extras/${id}`, extra);
export const deleteCatalogExtra = (id: string) => apiDelete<void>(`/catalog-extras/${id}`);

export const getCatalogArticles = () => apiGet<CatalogArticle[]>('/catalog-articles');
export const createCatalogArticle = (article: Omit<CatalogArticle, 'id' | 'createdAt'> & { id?: string }) => apiPost<CatalogArticle>('/catalog-articles', article);
export const updateCatalogArticle = (id: string, article: Omit<CatalogArticle, 'id' | 'createdAt'>) => apiPut<CatalogArticle>(`/catalog-articles/${id}`, article);
export const setArticleAvailability = (id: string, isAvailable: boolean) => apiPatch<CatalogArticle>(`/catalog-articles/${id}/availability`, { isAvailable });
export const deleteCatalogArticle = (id: string) => apiDelete<void>(`/catalog-articles/${id}`);

export const getSubRecipes = () => apiGet<SubRecipe[]>('/sub-recipes');
export const createSubRecipe = (subRecipe: Omit<SubRecipe, 'id' | 'createdAt'> & { id?: string }) => apiPost<SubRecipe>('/sub-recipes', subRecipe);
export const updateSubRecipe = (id: string, subRecipe: Omit<SubRecipe, 'id' | 'createdAt'>) => apiPut<SubRecipe>(`/sub-recipes/${id}`, subRecipe);
export const deleteSubRecipe = (id: string) => apiDelete<void>(`/sub-recipes/${id}`);
