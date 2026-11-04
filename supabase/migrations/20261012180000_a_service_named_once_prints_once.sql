-- Collapse a visit name that repeats the same service.
--
-- A visit with no service rows is shown a line read from its own
-- service_name, and that whole joined string went into the single line. Saving
-- re-joined it, so the name grew each time: "SPOT RESURFX" became
-- "SPOT RESURFX, SPOT RESURFX, SPOT RESURFX", and the printed prescription
-- named the treatment three times. The screen is fixed in
-- namesFromParent/parentServiceName (src/lib/serviceLineSave.ts).
--
-- Six visits carried a name repeating one service. Only those are touched: the
-- condition is that every part of the name, trimmed, is the SAME service, so a
-- real roll-up like "FILLERS, BOTOX" is left exactly as it is.
UPDATE public.procedures p
   SET service_name = (SELECT DISTINCT trim(x) FROM unnest(string_to_array(p.service_name, ',')) x)
 WHERE p.service_name LIKE '%, %'
   AND (SELECT count(DISTINCT trim(x)) FROM unnest(string_to_array(p.service_name, ',')) x) = 1;
