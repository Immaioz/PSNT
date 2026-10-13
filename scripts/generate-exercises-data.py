"""Genera un exercises-data.json compatto per l'app web PSNT.

Prende il dataset completo (17MB, tutte le lingue) + translations_it.json
e produce solo i campi usati dall'app, con i testi in italiano.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'webapp', 'static', 'exercises', 'exercises.json')
TR = os.path.join(ROOT, 'webapp', 'static', 'exercises', 'translations_it.json')
OUT = os.path.abspath(os.path.join(HERE, '..', 'public', 'exercises-data.json'))


def main():
    with open(SRC, encoding='utf-8') as f:
        data = json.load(f)
    with open(TR, encoding='utf-8') as f:
        tr = json.load(f)

    bp = tr.get('body_part', {})
    tg = tr.get('target', {})
    eq = tr.get('equipment', {})
    names_it = tr.get('names_it', {})

    def it(d, key):
        if key is None:
            return None
        return d.get(key, key)

    def name_it(e):
        nm = e.get('name')
        if not nm:
            return nm
        return names_it.get(nm) or names_it.get(nm.lower()) or nm

    out = []
    for e in data:
        ex_id = str(e.get('id', '')).zfill(4)
        instr = (e.get('instructions') or {}).get('it') or ''
        steps = (e.get('instruction_steps') or {}).get('it') or []
        out.append({
            'id': e.get('id'),
            'name': e.get('name'),
            'name_it': name_it(e),
            'body_part': e.get('body_part'),
            'body_part_it': it(bp, e.get('body_part')),
            'target': e.get('target'),
            'target_it': it(tg, e.get('target')),
            'equipment': e.get('equipment'),
            'equipment_it': it(eq, e.get('equipment')),
            'secondary_muscles': e.get('secondary_muscles') or [],
            'image': e.get('image'),
            'gif_url': e.get('gif_url'),
            'instructions_it': instr,
            'steps_it': steps,
            'attribution': e.get('attribution') or ''
        })

    out.sort(key=lambda x: str(x.get('id', '')))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(OUT)
    print('scritti %d esercizi' % len(out))
    print('output: %s' % OUT)
    print('dimensione: %.2f MB' % (size / 1024 / 1024))


if __name__ == '__main__':
    sys.exit(main())
