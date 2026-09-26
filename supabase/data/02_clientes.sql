-- Carga inicial: clientes (Etapa 1).
-- El schema original definia email NOT NULL UNIQUE; datos reales tienen
-- clientes sin email (venta en persona) y un par de 'noaplica' repetidos,
-- asi que se relaja antes de cargar.
alter table clientes alter column email drop not null;
alter table clientes drop constraint if exists clientes_email_key;

begin;

insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('5824d3d4-9326-43fe-8cf2-ba9922c29cd7', 'WS', 1, 'Natalia', '', NULL, '');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('7c5cb4b3-a71c-47c2-965a-a55266592322', 'WS', 2, 'Maria Victoria', 'Luzuriaga', NULL, '');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('10b013ff-9bf8-42ff-a307-67872040c4ec', 'WS', 3, 'Yamila', 'Ribba', NULL, '');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('749d4813-06eb-4a5c-aa16-a21f61a7f8bd', 'WS', 4, 'Marie', 'Apellido', NULL, '5491130007423');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('098e9274-d99f-4bd2-9a8b-e04ea6ce800c', 'WS', 5, 'Valeria', 'Calvo Paz', NULL, '5491154936415.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('cce1ceef-fb99-4b5f-8158-3f8be899f809', 'WS', 6, 'Julia', 'Manfrin', NULL, '5491158765327.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('62cd7f6e-8f6b-4a7d-aae4-a6da9d604a73', 'WS', 7, 'Romina', 'Verdini', NULL, '5491156018617.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('e5f8ac69-cc10-4533-b0b8-c1f5b6960d87', 'WS', 8, 'Diana Sosa', 'Vázquez Milo', 'sosadiana@gmail.com', '1164600627.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('df9a4431-a02e-4ba1-b368-bb55e597a857', 'WS', 9, 'Valeria', 'Vilanova', NULL, '525564774670.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('e33fcbee-ef17-433e-a134-173671261565', 'WS', 10, 'Florencia', 'Celedon', NULL, '54 9 11 6405-1363');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('b9821875-4253-4ce3-a490-269bd8325445', 'WS', 11, 'Agustina', 'Rezzani', NULL, '11 62933685');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('1f7a5bcf-55c5-4703-8ede-d95340c83439', 'WS', 12, 'Concepcion', 'Obregón', NULL, '11 49282683');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('c09a17ad-b8f3-44bb-9cc9-a54cf274aeef', 'WS', 13, 'Priscila', 'Martínez', NULL, '11 3404-9436');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('7de68460-9c20-4dc7-b564-86bfa0629f7c', 'WS', 14, 'Roxy', '', NULL, '1154523458.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('6188dfc7-eba2-4d0b-8414-e4d0b41d3ae6', 'WS', 15, 'Carlos', 'Noya', NULL, '');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('03d75d63-7237-45e1-aab6-33e6d37c6458', 'WS', 16, 'Mabel', 'Maiello', 'mebelmaiello', '11 30756222');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('c51724f7-e017-42bc-a8a1-f682aadbfd62', 'WS', 17, 'Carolina', 'Morrone', 'carolinamorrone', '11 66434957');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('5fb7111d-c058-4767-b092-d2906b0c4bfd', 'WS', 18, 'Cecilia', 'Ciancio', 'cecirovai@gmail.com', '1123731834.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('51fcef6e-20b9-4ca0-8056-65af341dabe6', 'WS', 19, 'Anabella', 'Chiorazzo', 'anabellachiorazzo', '11 38007419');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('713223d7-5826-426c-9eed-3a2cd7739831', 'WS', 20, 'Valeria', 'Vilanova', 'valeriavilanova', '1121930369.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('cca321fb-8466-4071-b701-f76bc58615c3', 'WS', 21, 'Valeria', 'Calvo Paz', 'valeriacarlospaz', '#ERROR!');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('1ae8eb12-2348-4c42-b48e-00a5f1bdb208', 'WS', 22, 'Francisco', 'Petracca', 'franciscopetracca', '+54 9 11 5840-7443');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('3367d286-fd18-4f8b-8211-667d6255b37d', 'WS', 23, 'Natalia', 'Narbais Jauregui', 'natalianarbaisjauregui@gmail.com', '54 9 11 3878-2598');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('6dc974e3-ca21-440b-a8bd-7ee6c1f78ed3', 'WS', 24, 'Mariana', 'Iglesias', 'mpagracia82@gmail.com', '1169737640.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('42ebe2e7-23f6-4aa7-8139-d0a06e9132c2', 'WS', 25, 'Virginia', 'Virginia', 'vdomina.perez@gmail.com', '1128720044.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('41166407-af20-4c2e-b069-fbd67c3d5527', 'WS', 26, 'Angelina', 'Guillermo', 'angelinaguillermo', '11 32420109');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('edeb158e-7156-4dd3-a82c-db74ae209e10', 'WS', 27, 'CAROLINA', 'GIBOUDOT', 'caro_gibo@hotmail.com', '1156421453.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('bf11e1e8-5f71-492e-826b-e9387920f45f', 'WS', 28, 'Jimena', 'DI MAIO', 'jedimaio@wellspring.edu.ar', '1536186180.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('a4d4cce5-28d3-41f0-b743-773b899d1742', 'WS', 29, 'Graciela', 'Menéndez', 'gracielamenendez', '1141652926.0');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('46de5138-1ca0-4629-a5ab-e0ca33e3cb49', 'WS', 30, 'Natacha', 'Angriman', 'natachaangriman', '11 31901215');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('0b91841f-7a8c-46b9-82aa-a2353d8b5667', 'WS', 31, 'Valeria', 'Calvo Paz', 'valeriacalvopaz', '#ERROR!');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('e141656c-e575-480c-8823-bd379729c8ec', 'WS', 32, 'Vanina', 'Casella', 'vaninacasella', '#ERROR!');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('5e3bbe9b-afd0-4235-a7b3-18efa45d6241', 'WS', 33, 'Carolina', 'Guarnuccio', 'carolinaguarnuccio', '5491159144348');
insert into clientes (id, colegio, nro, nombre, apellido, email, telefono) values ('b397dab7-d0bf-47ab-876d-31355f607aba', 'WS', 34, 'Agustina', '', 'agustina', '#ERROR!');

select setval('clientes_nro_seq', 34);

commit;