import { buildTrainedEntry, grantTrainedAbility } from './applyTraining';

const GRANT = {
  kind: 'reaction',
  reaction: { name: 'Shield Block', trigger: 'While you have your shield raised…', description: 'You snap your shield in place…' },
};

const entry = {
  charId: 'c1',
  charName: 'Ashka',
  vendorId: 'sandpoint-garrison',
  vendorName: 'Sandpoint Garrison',
  offeringId: 'shield-block',
  offeringName: 'Shield Block',
  choiceId: null,
  choiceName: null,
  grant: GRANT,
};

describe('buildTrainedEntry', () => {
  it('carries the grant payload plus provenance and a grant stamp', () => {
    const t = buildTrainedEntry(entry);
    expect(t).toMatchObject({
      kind: 'reaction',
      reaction: GRANT.reaction,
      vendorId: 'sandpoint-garrison',
      offeringId: 'shield-block',
      choiceId: null,
    });
    expect(typeof t.grantedAt).toBe('number');
  });

  it('records the picked choice', () => {
    const t = buildTrainedEntry({ ...entry, choiceId: 'aiding-shield' });
    expect(t.choiceId).toBe('aiding-shield');
  });
});

describe('grantTrainedAbility', () => {
  it('appends to the raw doc trained[] and persists via saveDocument', async () => {
    const rawCharacters = [{ id: 'c1', name: 'Ashka', trained: [{ kind: 'reaction', reaction: { name: 'Old' } }] }];
    const saveDocument = vi.fn(() => Promise.resolve());
    const refresh = vi.fn();
    const appendLog = vi.fn();

    const ok = await grantTrainedAbility({ entry, rawCharacters, saveDocument, refresh, appendLog });

    expect(ok).toBe(true);
    const [collection, id, doc] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('c1');
    expect(doc.trained).toHaveLength(2);
    expect(doc.trained[1].reaction.name).toBe('Shield Block');
    expect(refresh).toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        charId: 'c1',
        text: 'Ashka completed training at Sandpoint Garrison: Shield Block learned',
      }),
    );
  });

  it('handles a doc with no existing trained field', async () => {
    const saveDocument = vi.fn(() => Promise.resolve());
    await grantTrainedAbility({ entry, rawCharacters: [{ id: 'c1' }], saveDocument });
    expect(saveDocument.mock.calls[0][2].trained).toHaveLength(1);
  });

  it('logs the picked choice as the learned ability', async () => {
    const appendLog = vi.fn();
    const saveDocument = vi.fn(() => Promise.resolve());
    await grantTrainedAbility({
      entry: { ...entry, offeringName: 'Specialized Shield Training (Medium)', choiceName: 'Aiding Shield' },
      rawCharacters: [{ id: 'c1' }],
      saveDocument,
      appendLog,
    });
    expect(appendLog.mock.calls[0][0].text).toContain('Aiding Shield learned');
  });

  it('returns false and does not save when the character is missing', async () => {
    const saveDocument = vi.fn(() => Promise.resolve());
    const ok = await grantTrainedAbility({ entry, rawCharacters: [], saveDocument });
    expect(ok).toBe(false);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('returns false when the entry carries no grant payload', async () => {
    const saveDocument = vi.fn(() => Promise.resolve());
    const ok = await grantTrainedAbility({
      entry: { ...entry, grant: null },
      rawCharacters: [{ id: 'c1' }],
      saveDocument,
    });
    expect(ok).toBe(false);
    expect(saveDocument).not.toHaveBeenCalled();
  });
});
