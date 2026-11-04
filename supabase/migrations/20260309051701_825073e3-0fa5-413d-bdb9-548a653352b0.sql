-- Add public (anon) access policies for all tables since auth is skipped for now
-- These should be replaced with proper auth-based policies when authentication is enabled

-- Patients table
CREATE POLICY "Allow public read access to patients" ON public.patients FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to patients" ON public.patients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to patients" ON public.patients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to patients" ON public.patients FOR DELETE TO anon USING (true);

-- Appointments table
CREATE POLICY "Allow public read access to appointments" ON public.appointments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to appointments" ON public.appointments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to appointments" ON public.appointments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to appointments" ON public.appointments FOR DELETE TO anon USING (true);

-- Invoices table
CREATE POLICY "Allow public read access to invoices" ON public.invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to invoices" ON public.invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to invoices" ON public.invoices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to invoices" ON public.invoices FOR DELETE TO anon USING (true);

-- Procedures table
CREATE POLICY "Allow public read access to procedures" ON public.procedures FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to procedures" ON public.procedures FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to procedures" ON public.procedures FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to procedures" ON public.procedures FOR DELETE TO anon USING (true);

-- Patient photos table
CREATE POLICY "Allow public read access to patient_photos" ON public.patient_photos FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to patient_photos" ON public.patient_photos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to patient_photos" ON public.patient_photos FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to patient_photos" ON public.patient_photos FOR DELETE TO anon USING (true);

-- Staff table
CREATE POLICY "Allow public read access to staff" ON public.staff FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to staff" ON public.staff FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to staff" ON public.staff FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to staff" ON public.staff FOR DELETE TO anon USING (true);

-- Pharma products table
CREATE POLICY "Allow public read access to pharma_products" ON public.pharma_products FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to pharma_products" ON public.pharma_products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to pharma_products" ON public.pharma_products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to pharma_products" ON public.pharma_products FOR DELETE TO anon USING (true);

-- Pharma inventory table
CREATE POLICY "Allow public read access to pharma_inventory" ON public.pharma_inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to pharma_inventory" ON public.pharma_inventory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to pharma_inventory" ON public.pharma_inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to pharma_inventory" ON public.pharma_inventory FOR DELETE TO anon USING (true);

-- Pharma bills table
CREATE POLICY "Allow public read access to pharma_bills" ON public.pharma_bills FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to pharma_bills" ON public.pharma_bills FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to pharma_bills" ON public.pharma_bills FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Pharma bill items table
CREATE POLICY "Allow public read access to pharma_bill_items" ON public.pharma_bill_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to pharma_bill_items" ON public.pharma_bill_items FOR INSERT TO anon WITH CHECK (true);

-- Prescriptions table
CREATE POLICY "Allow public read access to prescriptions" ON public.prescriptions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to prescriptions" ON public.prescriptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to prescriptions" ON public.prescriptions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to prescriptions" ON public.prescriptions FOR DELETE TO anon USING (true);

-- Working hours table
CREATE POLICY "Allow public read access to working_hours" ON public.working_hours FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to working_hours" ON public.working_hours FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to working_hours" ON public.working_hours FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Clinic settings table
CREATE POLICY "Allow public read access to clinic_settings" ON public.clinic_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to clinic_settings" ON public.clinic_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to clinic_settings" ON public.clinic_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Tax master table
CREATE POLICY "Allow public read access to tax_master" ON public.tax_master FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to tax_master" ON public.tax_master FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to tax_master" ON public.tax_master FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to tax_master" ON public.tax_master FOR DELETE TO anon USING (true);

-- Leave types table
CREATE POLICY "Allow public read access to leave_types" ON public.leave_types FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to leave_types" ON public.leave_types FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to leave_types" ON public.leave_types FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to leave_types" ON public.leave_types FOR DELETE TO anon USING (true);

-- Leave applications table
CREATE POLICY "Allow public read access to leave_applications" ON public.leave_applications FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to leave_applications" ON public.leave_applications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to leave_applications" ON public.leave_applications FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to leave_applications" ON public.leave_applications FOR DELETE TO anon USING (true);

-- Staff leave balances table
CREATE POLICY "Allow public read access to staff_leave_balances" ON public.staff_leave_balances FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to staff_leave_balances" ON public.staff_leave_balances FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to staff_leave_balances" ON public.staff_leave_balances FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to staff_leave_balances" ON public.staff_leave_balances FOR DELETE TO anon USING (true);

-- Staff roles table
CREATE POLICY "Allow public read access to staff_roles" ON public.staff_roles FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to staff_roles" ON public.staff_roles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to staff_roles" ON public.staff_roles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access to staff_roles" ON public.staff_roles FOR DELETE TO anon USING (true);

-- Attendance records table
CREATE POLICY "Allow public read access to attendance_records" ON public.attendance_records FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to attendance_records" ON public.attendance_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to attendance_records" ON public.attendance_records FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Portal tokens table (already has all access)
CREATE POLICY "Allow public read access to patient_portal_tokens" ON public.patient_portal_tokens FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to patient_portal_tokens" ON public.patient_portal_tokens FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to patient_portal_tokens" ON public.patient_portal_tokens FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Patient pharma requests table (already has all access)
CREATE POLICY "Allow public read access to patient_pharma_requests" ON public.patient_pharma_requests FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert access to patient_pharma_requests" ON public.patient_pharma_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update access to patient_pharma_requests" ON public.patient_pharma_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);