export interface IdeaCadDocumentSummary {
	id: string;
	itemId: string;
	title: string;
	updatedAt: string;
}

export interface IdeaCadDocumentSource {
	itemId: string;
	title: string;
}

export interface IdeaCadPaneLayout {
	left: number;
	right: number;
	leftOpen: boolean;
	rightOpen: boolean;
}
