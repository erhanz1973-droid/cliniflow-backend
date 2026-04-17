-- Migration: Add chair column to treatment_items
-- Adds an integer column 'chair' to the treatment_items table for chair assignment

ALTER TABLE treatment_items
ADD COLUMN chair INTEGER;
