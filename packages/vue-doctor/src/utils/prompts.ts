import promptsLib from "prompts";

let selectBannerText: string | null = null;
let selectBannerIndex = -1;

export const setSelectBanner = (text: string, index: number): void => {
  selectBannerText = text;
  selectBannerIndex = index;
};

export const clearSelectBanner = (): void => {
  selectBannerText = null;
  selectBannerIndex = -1;
};

export const prompts = async <T extends string>(
  question: promptsLib.PromptObject<T>,
): Promise<promptsLib.Answers<T>> => {
  const result = await promptsLib(question, {
    onCancel: () => {
      process.exit(0);
    },
  });
  return result;
};
