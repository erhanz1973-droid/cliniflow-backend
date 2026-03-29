-- Migration: Populate multilingual procedure names in procedures table

UPDATE procedures SET
  name_en = 'Treatment Event',
  name_tr = 'Tedavi Randevusu',
  name_ru = 'Лечебный прием',
  name_ka = 'სამკურნალო ვიზიტი'
WHERE id = 'TREATMENT';

UPDATE procedures SET
  name_en = 'Consultation',
  name_tr = 'Konsültasyon',
  name_ru = 'Консультация',
  name_ka = 'კონსულტაცია'
WHERE id = 'CONSULT';

UPDATE procedures SET
  name_en = 'Follow-up',
  name_tr = 'Kontrol',
  name_ru = 'Контроль',
  name_ka = 'კონტროლი'
WHERE id = 'FOLLOWUP';

UPDATE procedures SET
  name_en = 'Lab / Scan',
  name_tr = 'Lab / Tarama',
  name_ru = 'Лаборатория / Сканирование',
  name_ka = 'ლაბ / სკანერი'
WHERE id = 'LAB';

UPDATE procedures SET
  name_en = 'Crown',
  name_tr = 'Kuron',
  name_ru = 'Коронка',
  name_ka = 'გვირგვინი'
WHERE id = 'CROWN';

UPDATE procedures SET
  name_en = 'Temporary Crown',
  name_tr = 'Geçici Kuron',
  name_ru = 'Временная коронка',
  name_ka = 'დროებითი გვირგვინი'
WHERE id = 'TEMP_CROWN';

UPDATE procedures SET
  name_en = 'Bridge (tooth unit)',
  name_tr = 'Köprü – diş birimi',
  name_ru = 'Мост (единица)',
  name_ka = 'ხიდი (კბილის ერთეული)'
WHERE id = 'BRIDGE_UNIT';

UPDATE procedures SET
  name_en = 'Temporary Bridge (tooth unit)',
  name_tr = 'Geçici Köprü – diş birimi',
  name_ru = 'Временный мост (единица)',
  name_ka = 'დროებითი ხიდი (კბილის ერთეული)'
WHERE id = 'TEMP_BRIDGE_UNIT';

UPDATE procedures SET
  name_en = 'Crown Replacement',
  name_tr = 'Kuron Yenileme',
  name_ru = 'Замена коронки',
  name_ka = 'გვირგვინის შეცვლა'
WHERE id = 'CROWN_REPLACEMENT';

UPDATE procedures SET
  name_en = 'Bridge Replacement / Removal',
  name_tr = 'Köprü Yenileme / Sökme',
  name_ru = 'Замена / удаление моста',
  name_ka = 'ხიდის შეცვლა / მოხსნა'
WHERE id = 'BRIDGE_REPLACEMENT_OR_REMOVAL';

UPDATE procedures SET
  name_en = 'Inlay',
  name_tr = 'İnley',
  name_ru = 'Инлей',
  name_ka = 'ინლეი'
WHERE id = 'INLAY';

UPDATE procedures SET
  name_en = 'Onlay',
  name_tr = 'Onley',
  name_ru = 'Онлей',
  name_ka = 'ონლეი'
WHERE id = 'ONLAY';

UPDATE procedures SET
  name_en = 'Overlay',
  name_tr = 'Overlay',
  name_ru = 'Оверлей',
  name_ka = 'ოვერლეი'
WHERE id = 'OVERLAY';

UPDATE procedures SET
  name_en = 'Post & Core',
  name_tr = 'Post & Core',
  name_ru = 'Штифт и культя',
  name_ka = 'პინი და ბირთვი'
WHERE id = 'POST_AND_CORE';

UPDATE procedures SET
  name_en = 'Filling',
  name_tr = 'Dolgu',
  name_ru = 'Пломба',
  name_ka = 'პლომბა'
WHERE id = 'FILLING';

UPDATE procedures SET
  name_en = 'Temporary Filling',
  name_tr = 'Geçici Dolgu',
  name_ru = 'Временная пломба',
  name_ka = 'დროებითი პლომბა'
WHERE id = 'TEMP_FILLING';

UPDATE procedures SET
  name_en = 'Filling Replacement / Removal',
  name_tr = 'Dolgu Yenileme / Sökme',
  name_ru = 'Замена / удаление пломбы',
  name_ka = 'პლომბის შეცვლა / მოხსნა'
WHERE id = 'FILLING_REPLACEMENT_OR_REMOVAL';

UPDATE procedures SET
  name_en = 'Root Canal Treatment',
  name_tr = 'Kanal Tedavisi',
  name_ru = 'Лечение каналов',
  name_ka = 'ფესვის არხის მკურნალობა'
WHERE id = 'ROOT_CANAL_TREATMENT';

UPDATE procedures SET
  name_en = 'Root Canal Retreatment',
  name_tr = 'Kanal Retreatmanı',
  name_ru = 'Повторное лечение каналов',
  name_ka = 'ფესვის არხის ხელახლა მკურნალობა'
WHERE id = 'ROOT_CANAL_RETREATMENT';

UPDATE procedures SET
  name_en = 'Canal Opening',
  name_tr = 'Kanal Açma',
  name_ru = 'Вскрытие канала',
  name_ka = 'არხის გახსნა'
WHERE id = 'CANAL_OPENING';

UPDATE procedures SET
  name_en = 'Canal Filling',
  name_tr = 'Kanal Dolgusu',
  name_ru = 'Пломбирование канала',
  name_ka = 'არხის პლომბირება'
WHERE id = 'CANAL_FILLING';

UPDATE procedures SET
  name_en = 'Extraction',
  name_tr = 'Çekim',
  name_ru = 'Удаление зуба',
  name_ka = 'კბილის ამოღება'
WHERE id = 'EXTRACTION';

UPDATE procedures SET
  name_en = 'Surgical Extraction',
  name_tr = 'Cerrahi Çekim',
  name_ru = 'Хирургическое удаление',
  name_ka = 'ქირურგიული ამოღება'
WHERE id = 'SURGICAL_EXTRACTION';

UPDATE procedures SET
  name_en = 'Apical Resection',
  name_tr = 'Apikal Rezeksiyon',
  name_ru = 'Апикальная резекция',
  name_ka = 'აპიკური რეზექცია'
WHERE id = 'APICAL_RESECTION';

UPDATE procedures SET
  name_en = 'Implant',
  name_tr = 'İmplant',
  name_ru = 'Имплант',
  name_ka = 'იმპლანტი'
WHERE id = 'IMPLANT';

UPDATE procedures SET
  name_en = 'Healing Abutment',
  name_tr = 'İyileşme Abutmanı',
  name_ru = 'Формирователь десны',
  name_ka = 'სამკურნალო ყელსაბამი'
WHERE id = 'HEALING_ABUTMENT';

UPDATE procedures SET
  name_en = 'Implant Crown',
  name_tr = 'İmplant Kuron',
  name_ru = 'Коронка на имплант',
  name_ka = 'იმპლანტის გვირგვინი'
WHERE id = 'IMPLANT_CROWN';
