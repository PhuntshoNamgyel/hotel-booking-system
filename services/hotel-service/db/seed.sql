-- Sample data. Running this again resets hotels, rooms and reservations.
TRUNCATE reservations, rooms, hotels RESTART IDENTITY CASCADE;

INSERT INTO hotels (name, city, description) VALUES
  ('Druk Heritage Hotel', 'Thimphu', 'Traditional Bhutanese architecture in the heart of the capital.'),
  ('Paro Valley Lodge', 'Paro', 'Quiet lodge with mountain views near the airport.'),
  ('Punakha River Resort', 'Punakha', 'Riverside resort close to Punakha Dzong.');

INSERT INTO rooms (hotel_id, room_type, price_per_night, total_units) VALUES
  (1, 'Standard', 80.00, 5),
  (1, 'Deluxe', 120.00, 3),
  (1, 'Suite', 200.00, 1),
  (2, 'Standard', 70.00, 4),
  (2, 'Family Room', 130.00, 2),
  (3, 'Standard', 90.00, 3),
  (3, 'River View Suite', 180.00, 2);