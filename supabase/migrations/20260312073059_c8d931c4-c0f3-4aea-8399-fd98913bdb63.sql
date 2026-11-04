-- Add image_url column to pharma_products
ALTER TABLE public.pharma_products ADD COLUMN image_url text DEFAULT NULL;

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Allow public read access to product images
CREATE POLICY "Public read access to product images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-images');

-- Allow authenticated and anon users to upload product images
CREATE POLICY "Allow upload product images" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'product-images');

-- Allow update/delete
CREATE POLICY "Allow update product images" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'product-images');
CREATE POLICY "Allow delete product images" ON storage.objects FOR DELETE TO public USING (bucket_id = 'product-images');